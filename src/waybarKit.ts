import type { SystemSource } from "./compiler"

export interface WaybarKitSource {
  readonly name: string
  readonly content: string
}

// The Rust helpers for the declared system sources and the one place the unit convention lives.
export function waybarSystemKit(sources: readonly SystemSource[], crate: string, units = false): WaybarKitSource[] {
  if (sources.length === 0 && !units) return []
  const has = (source: SystemSource) => sources.includes(source)
  const net = has("network-received") || has("network-sent")
  const counter = net || has("disk-read")
  const sizes = units
  const parts: string[] = sources.length === 0 ? [] : [`/// Operating-system sources, each read through SystemReader so tests inject their own reader.
pub trait SystemReader {
    type Reading;
    fn read(&self) -> Result<Self::Reading, String>;
}
${sources.some(source => source !== "disk-space" && source !== "temperature") ? `
fn read_text(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|error| format!("cannot read {path}: {error}"))
}
` : ""}`]
  const tests: string[] = []
  if (counter) {
    parts.push(`/// A counter that went backwards (reset or interface change) is a change of 0 for that sample.
pub fn counter_change(previous: u64, current: u64) -> u64 {
    current.saturating_sub(previous)
}
`)
  }
  if (has("disk-read")) {
    parts.push(`pub const DISKSTATS_PATH_ENV: &str = "MODULE_DISKSTATS_PATH";
pub const DISKSTATS_PATH: &str = "/proc/diskstats";
const SECTOR_BYTES: u64 = 512;

/// A whole disk (sdX, hdX, vdX, xvdX, nvmeXnY, mmcblkX), never a partition, loop, ram, or device-mapper device.
pub fn is_whole_disk(name: &str) -> bool {
    let letters = |rest: &str| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_lowercase());
    let digits = |rest: &str| !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit());
    for prefix in ["sd", "hd", "vd", "xvd"] {
        if let Some(rest) = name.strip_prefix(prefix) {
            return letters(rest);
        }
    }
    if let Some(rest) = name.strip_prefix("nvme") {
        return rest
            .split_once('n')
            .is_some_and(|(controller, namespace)| digits(controller) && digits(namespace));
    }
    name.strip_prefix("mmcblk").is_some_and(digits)
}

/// Total bytes read since boot: the sectors-read column (field 6 after major, minor, name) of every whole
/// disk in /proc/diskstats, summed and multiplied by 512.
pub fn parse_disk_read(text: &str) -> Result<u64, String> {
    let mut sectors: u64 = 0;
    let mut seen = false;
    for line in text.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        let Some(name) = fields.get(2) else {
            continue;
        };
        if !is_whole_disk(name) {
            continue;
        }
        let value: u64 = fields
            .get(5)
            .ok_or_else(|| format!("short line for {name}"))?
            .parse()
            .map_err(|_| format!("bad sectors-read counter for {name}"))?;
        sectors = sectors.saturating_add(value);
        seen = true;
    }
    if seen {
        Ok(sectors.saturating_mul(SECTOR_BYTES))
    } else {
        Err(String::from("no whole disk in diskstats"))
    }
}

/// Cumulative bytes read from the whole disks; the file is overridable for tests.
pub struct DiskReadReader {
    pub path: String,
}

impl DiskReadReader {
    /// Production reads /proc/diskstats unless MODULE_DISKSTATS_PATH names a fixture file.
    pub fn from_env() -> Self {
        let path =
            std::env::var(DISKSTATS_PATH_ENV).unwrap_or_else(|_| String::from(DISKSTATS_PATH));
        DiskReadReader { path }
    }
}

impl SystemReader for DiskReadReader {
    type Reading = u64;
    fn read(&self) -> Result<u64, String> {
        parse_disk_read(&read_text(&self.path)?)
    }
}
`)
    tests.push(`const DISKSTATS: &str = "   8       0 sda 100 0 2000 50 10 0 80 5 0 40 55
   8       1 sda1 90 0 1500 40 5 0 40 3 0 30 43
 259       0 nvme0n1 200 0 4000 60 20 0 160 9 0 70 69
 259       1 nvme0n1p1 190 0 3500 55 15 0 100 7 0 60 62
   7       0 loop0 5 0 999 1 0 0 0 0 0 1 1
 254       0 dm-0 50 0 777 9 0 0 0 0 0 9 9
";

#[test]
fn disk_read_sums_the_sectors_of_whole_disks_times_512() {
    // (2000 + 4000) sectors x 512; partitions, loop, and device-mapper devices are not counted.
    assert_eq!(parse_disk_read(DISKSTATS), Ok(3_072_000));
    let only_loop = "   7       0 loop0 5 0 999 1\\n";
    assert!(parse_disk_read(only_loop).is_err());
    let short = "   8       0 sda 1 0\\n";
    assert!(parse_disk_read(short).is_err());
    assert_eq!(counter_change(3_072_000, 3_584_000), 512_000);
    assert_eq!(counter_change(3_584_000, 0), 0);
}

#[test]
fn whole_disks_are_told_from_partitions() {
    for name in ["sda", "vdb", "xvda", "hdc", "nvme0n1", "mmcblk0"] {
        assert!(is_whole_disk(name), "{name}");
    }
    for name in [
        "sda1",
        "nvme0n1p1",
        "mmcblk0p2",
        "loop0",
        "dm-0",
        "zram0",
        "sr0",
        "md0",
    ] {
        assert!(!is_whole_disk(name), "{name}");
    }
}

#[test]
fn the_disk_read_reader_reads_the_overridable_file() {
    let directory = tempfile::tempdir().expect("temp dir");
    let path = directory.path().join("diskstats");
    std::fs::write(&path, DISKSTATS).expect("write fixture");
    let reader = DiskReadReader {
        path: path.to_string_lossy().into_owned(),
    };
    assert_eq!(reader.read(), Ok(3_072_000));
    let missing = DiskReadReader {
        path: directory.path().join("none").to_string_lossy().into_owned(),
    };
    assert!(missing.read().is_err());
}
`)
  }
  if (net) {
    parts.push(`pub const NET_DEV_PATH: &str = "/proc/net/dev";

/// Sum one /proc/net/dev column (0 = rx_bytes, 8 = tx_bytes) over every interface except lo.
fn net_column(text: &str, column: usize) -> Result<u64, String> {
    let mut total: u64 = 0;
    let mut seen = false;
    for line in text.lines().skip(2) {
        let Some((name, rest)) = line.split_once(':') else {
            continue;
        };
        let name = name.trim();
        if name == "lo" {
            continue;
        }
        let value: u64 = rest
            .split_whitespace()
            .nth(column)
            .ok_or_else(|| format!("short line for {name}"))?
            .parse()
            .map_err(|_| format!("bad counter for {name}"))?;
        total = total.saturating_add(value);
        seen = true;
    }
    if seen {
        Ok(total)
    } else {
        Err(String::from("no network interface besides lo"))
    }
}
`)
    tests.push(`const NET_DEV: &str = "Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 900 9 0 0 0 0 0 0 900 9 0 0 0 0 0 0
  eth0: 1000 10 0 0 0 0 0 0 400 4 0 0 0 0 0 0
 wlan0: 2000 20 0 0 0 0 0 0 600 6 0 0 0 0 0 0
";

#[test]
fn counters_sum_every_interface_except_lo_and_a_decrease_is_zero() {
${has("network-received") ? "    assert_eq!(parse_net_received(NET_DEV), Ok(3000));\n" : ""}${has("network-sent") ? "    assert_eq!(parse_net_sent(NET_DEV), Ok(1000));\n" : ""}    assert_eq!(counter_change(3000, 4000), 1000);
    assert_eq!(counter_change(4000, 100), 0);
}

#[test]
fn counters_without_a_real_interface_are_an_error() {
    let only_lo = "h1\\nh2\\n    lo: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\\n";
    assert!(${has("network-received") ? "parse_net_received" : "parse_net_sent"}(only_lo).is_err());
}
`)
    if (has("network-received")) {
      parts.push(`pub fn parse_net_received(text: &str) -> Result<u64, String> {
    net_column(text, 0)
}

pub struct NetReceivedReader;

impl SystemReader for NetReceivedReader {
    type Reading = u64;
    fn read(&self) -> Result<u64, String> {
        parse_net_received(&read_text(NET_DEV_PATH)?)
    }
}
`)
    }
    if (has("network-sent")) {
      parts.push(`pub fn parse_net_sent(text: &str) -> Result<u64, String> {
    net_column(text, 8)
}

pub struct NetSentReader;

impl SystemReader for NetSentReader {
    type Reading = u64;
    fn read(&self) -> Result<u64, String> {
        parse_net_sent(&read_text(NET_DEV_PATH)?)
    }
}
`)
    }
  }
  if (has("load-average")) {
    parts.push(`pub fn parse_load_average(text: &str) -> Result<f64, String> {
    text.split_whitespace()
        .next()
        .ok_or_else(|| String::from("empty loadavg"))?
        .parse()
        .map_err(|_| String::from("bad loadavg"))
}

pub struct LoadAverageReader;

impl SystemReader for LoadAverageReader {
    type Reading = f64;
    fn read(&self) -> Result<f64, String> {
        parse_load_average(&read_text("/proc/loadavg")?)
    }
}
`)
    tests.push(`#[test]
fn load_average_is_the_first_field() {
    assert_eq!(parse_load_average("0.52 0.40 0.30 1/200 999\\n"), Ok(0.52));
    assert!(parse_load_average("").is_err());
}
`)
  }
  if (has("memory") || has("swap")) {
    parts.push(`fn meminfo_bytes(text: &str, key: &str) -> Result<u64, String> {
    let line = text
        .lines()
        .find(|line| line.starts_with(key))
        .ok_or_else(|| format!("missing {key}"))?;
    let kilobytes: u64 = line
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| format!("short {key} line"))?
        .parse()
        .map_err(|_| format!("bad {key} value"))?;
    Ok(kilobytes.saturating_mul(1024))
}

pub const MEMINFO_PATH_ENV: &str = "MODULE_MEMINFO_PATH";
pub const MEMINFO_PATH: &str = "/proc/meminfo";
`)
  }
  if (has("memory")) {
    parts.push(`#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MemoryUse {
    pub total_bytes: u64,
    pub used_bytes: u64,
}

/// free = MemAvailable (not MemFree); used = MemTotal - MemAvailable; the meminfo kB lines are multiplied by 1024 to bytes.
pub fn parse_meminfo(text: &str) -> Result<MemoryUse, String> {
    let total_bytes = meminfo_bytes(text, "MemTotal:")?;
    let available = meminfo_bytes(text, "MemAvailable:")?;
    Ok(MemoryUse {
        total_bytes,
        used_bytes: total_bytes.saturating_sub(available),
    })
}

pub struct MemoryReader {
    pub path: String,
}

impl MemoryReader {
    /// Production reads /proc/meminfo unless MODULE_MEMINFO_PATH names a fixture file.
    pub fn from_env() -> Self {
        MemoryReader {
            path: std::env::var(MEMINFO_PATH_ENV).unwrap_or_else(|_| String::from(MEMINFO_PATH)),
        }
    }
}

impl SystemReader for MemoryReader {
    type Reading = MemoryUse;
    fn read(&self) -> Result<MemoryUse, String> {
        parse_meminfo(&read_text(&self.path)?)
    }
}
`)
    tests.push(`#[test]
fn meminfo_gives_used_bytes() {
    let text = "MemTotal:       1000 kB\\nMemFree: 100 kB\\nMemAvailable:    250 kB\\n";
    let used = parse_meminfo(text).expect("meminfo");
    assert_eq!(used.total_bytes, 1_024_000);
    assert_eq!(used.used_bytes, 768_000);
    assert!(parse_meminfo("MemTotal: 1 kB\\n").is_err());
}

#[test]
fn memory_reader_reads_the_fixture_file_and_fails_on_a_missing_one() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("meminfo");
    std::fs::write(&path, "MemTotal: 1000 kB\\nMemAvailable: 250 kB\\n").expect("fixture");
    let reader = MemoryReader {
        path: path.to_string_lossy().into_owned(),
    };
    assert_eq!(reader.read().expect("read").used_bytes, 768_000);
    let missing = MemoryReader {
        path: directory.path().join("none").to_string_lossy().into_owned(),
    };
    assert!(missing.read().is_err());
}
`)
  }
  if (has("swap")) {
    parts.push(`#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapUse {
    pub total_bytes: u64,
    pub used_bytes: u64,
}

/// total = SwapTotal; used = SwapTotal - SwapFree; the meminfo kB lines are multiplied by 1024 to bytes. No swap is total 0, used 0.
pub fn parse_swapinfo(text: &str) -> Result<SwapUse, String> {
    let total_bytes = meminfo_bytes(text, "SwapTotal:")?;
    let free = meminfo_bytes(text, "SwapFree:")?;
    Ok(SwapUse {
        total_bytes,
        used_bytes: total_bytes.saturating_sub(free),
    })
}

pub struct SwapReader {
    pub path: String,
}

impl SwapReader {
    /// Production reads /proc/meminfo unless MODULE_MEMINFO_PATH names a fixture file.
    pub fn from_env() -> Self {
        SwapReader {
            path: std::env::var(MEMINFO_PATH_ENV).unwrap_or_else(|_| String::from(MEMINFO_PATH)),
        }
    }
}

impl SystemReader for SwapReader {
    type Reading = SwapUse;
    fn read(&self) -> Result<SwapUse, String> {
        parse_swapinfo(&read_text(&self.path)?)
    }
}
`)
    tests.push(`#[test]
fn swapinfo_gives_used_bytes_and_no_swap_is_zero() {
    let text = "MemTotal: 9000 kB\\nSwapTotal:       1000 kB\\nSwapFree:    250 kB\\n";
    let used = parse_swapinfo(text).expect("swapinfo");
    assert_eq!(used.total_bytes, 1_024_000);
    assert_eq!(used.used_bytes, 768_000);
    let none = parse_swapinfo("SwapTotal: 0 kB\\nSwapFree: 0 kB\\n").expect("no swap");
    assert_eq!((none.total_bytes, none.used_bytes), (0, 0));
    assert!(parse_swapinfo("MemTotal: 1 kB\\nMemAvailable: 1 kB\\n").is_err());
}

#[test]
fn swap_reader_reads_the_fixture_file_and_fails_on_a_missing_one() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let path = directory.path().join("meminfo");
    std::fs::write(&path, "SwapTotal: 1000 kB\\nSwapFree: 250 kB\\n").expect("fixture");
    let reader = SwapReader {
        path: path.to_string_lossy().into_owned(),
    };
    assert_eq!(reader.read().expect("read").used_bytes, 768_000);
    let missing = SwapReader {
        path: directory.path().join("none").to_string_lossy().into_owned(),
    };
    assert!(missing.read().is_err());
}
`)
  }
  if (has("disk-space")) {
    parts.push(`#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiskSpace {
    pub free_bytes: u64,
    pub used_bytes: u64,
    pub total_bytes: u64,
}

/// free = available blocks x fragment size (what a normal user can still write), total = blocks x fragment
/// size, used = total - free-to-root blocks x fragment size (the same rule df uses).
pub fn disk_space_from(
    fragment_size: u64,
    blocks: u64,
    blocks_free: u64,
    blocks_available: u64,
) -> DiskSpace {
    let total_bytes = blocks.saturating_mul(fragment_size);
    DiskSpace {
        free_bytes: blocks_available.saturating_mul(fragment_size),
        used_bytes: total_bytes.saturating_sub(blocks_free.saturating_mul(fragment_size)),
        total_bytes,
    }
}

/// The root file system, read through statvfs("/") (the nix crate wraps it safely).
pub struct DiskSpaceReader;

impl SystemReader for DiskSpaceReader {
    type Reading = DiskSpace;
    #[allow(clippy::useless_conversion)]
    fn read(&self) -> Result<DiskSpace, String> {
        let stat = nix::sys::statvfs::statvfs("/")
            .map_err(|error| format!("cannot read the root disk: {error}"))?;
        Ok(disk_space_from(
            u64::from(stat.fragment_size()),
            u64::from(stat.blocks()),
            u64::from(stat.blocks_free()),
            u64::from(stat.blocks_available()),
        ))
    }
}
`)
    tests.push(`#[test]
fn disk_space_is_free_used_and_total_from_the_statvfs_fields() {
    let space = disk_space_from(4096, 1000, 300, 250);
    assert_eq!(space.total_bytes, 4_096_000);
    assert_eq!(space.free_bytes, 1_024_000);
    assert_eq!(space.used_bytes, 2_867_200);
    assert_eq!(disk_space_from(4096, 0, 0, 0).total_bytes, 0);
}

#[test]
fn the_root_disk_reader_returns_a_consistent_reading() {
    let space = DiskSpaceReader.read().expect("statvfs of /");
    assert!(space.total_bytes > 0);
    assert!(space.used_bytes <= space.total_bytes);
    assert!(space.free_bytes <= space.total_bytes);
}
`)
  }
  if (has("battery")) {
    parts.push(`pub const POWER_SUPPLY_DIR_ENV: &str = "MODULE_POWER_SUPPLY_DIR";
pub const POWER_SUPPLY_DIR: &str = "/sys/class/power_supply";

/// The charge percentage (BAT*/capacity) and the charging state (BAT*/status) of one battery.
#[derive(Debug, PartialEq)]
pub struct BatteryReading {
    pub charge_percent: u8,
    pub charging_state: &'static str,
}

pub fn parse_capacity(text: &str) -> Result<u8, String> {
    let value: u8 = text
        .trim()
        .parse()
        .map_err(|_| String::from("bad battery capacity"))?;
    if value > 100 {
        return Err(String::from("battery capacity above 100"));
    }
    Ok(value)
}

/// sysfs status text to the stated set: charging, discharging, full, not charging, unknown (any other text is unknown).
pub fn parse_status(text: &str) -> &'static str {
    match text.trim() {
        "Charging" => "charging",
        "Discharging" => "discharging",
        "Full" => "full",
        "Not charging" => "not charging",
        _ => "unknown",
    }
}

/// The first BAT* supply in name order under dir.
pub struct BatteryReader {
    pub dir: std::path::PathBuf,
}

impl BatteryReader {
    /// Production reads /sys/class/power_supply unless MODULE_POWER_SUPPLY_DIR names a fixture tree.
    pub fn from_env() -> Self {
        let dir =
            std::env::var(POWER_SUPPLY_DIR_ENV).unwrap_or_else(|_| String::from(POWER_SUPPLY_DIR));
        BatteryReader { dir: dir.into() }
    }
}

impl SystemReader for BatteryReader {
    type Reading = BatteryReading;
    fn read(&self) -> Result<BatteryReading, String> {
        let mut supplies: Vec<String> = std::fs::read_dir(&self.dir)
            .map_err(|error| format!("cannot list power supplies: {error}"))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("BAT"))
            .collect();
        supplies.sort();
        let name = supplies
            .first()
            .ok_or_else(|| String::from("no battery found"))?;
        let file = |leaf: &str| read_text(&format!("{}/{name}/{leaf}", self.dir.display()));
        Ok(BatteryReading {
            charge_percent: parse_capacity(&file("capacity")?)?,
            charging_state: parse_status(&file("status")?),
        })
    }
}
`)
    tests.push(`#[test]
fn battery_capacity_is_a_percentage() {
    assert_eq!(parse_capacity("87\\n"), Ok(87));
    assert!(parse_capacity("101").is_err());
    assert!(parse_capacity("full").is_err());
}

#[test]
fn battery_status_maps_to_the_stated_set() {
    assert_eq!(parse_status("Charging\\n"), "charging");
    assert_eq!(parse_status("Discharging"), "discharging");
    assert_eq!(parse_status("Full"), "full");
    assert_eq!(parse_status("Not charging"), "not charging");
    assert_eq!(parse_status("Unknown"), "unknown");
    assert_eq!(parse_status("Something new"), "unknown");
}

#[test]
fn the_first_battery_supplies_capacity_and_status_and_an_absent_one_fails() {
    let dir = std::env::temp_dir().join(format!("power-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let reader = BatteryReader { dir: dir.clone() };
    assert!(reader.read().is_err());
    for (supply, capacity, status) in [
        ("BAT1", "20", "Discharging"),
        ("BAT0", "81", "Charging"),
        ("AC", "1", "Unknown"),
    ] {
        std::fs::create_dir_all(dir.join(supply)).expect("supply dir");
        std::fs::write(dir.join(supply).join("capacity"), capacity).expect("capacity file");
        std::fs::write(dir.join(supply).join("status"), status).expect("status file");
    }
    assert_eq!(
        reader.read(),
        Ok(BatteryReading {
            charge_percent: 81,
            charging_state: "charging"
        })
    );
    std::fs::remove_file(dir.join("BAT0").join("status")).expect("remove status");
    assert!(reader.read().is_err());
    std::fs::remove_dir_all(&dir).expect("cleanup");
}
`)
  }
  if (has("temperature")) {
    parts.push(`pub const THERMAL_DIR_ENV: &str = "MODULE_THERMAL_DIR";
pub const THERMAL_DIR: &str = "/sys/class/thermal";

/// Millidegrees (the thermal_zone*/temp unit) to degrees Celsius.
pub fn millidegrees_to_celsius(text: &str) -> Result<f64, String> {
    let milli: i64 = text
        .trim()
        .parse()
        .map_err(|_| String::from("bad thermal zone value"))?;
    Ok(milli as f64 / 1000.0)
}

/// The CPU temperature: the highest thermal_zone*/temp under dir, in Celsius.
pub struct TemperatureReader {
    pub dir: std::path::PathBuf,
}

impl TemperatureReader {
    /// Production reads /sys/class/thermal unless MODULE_THERMAL_DIR names a fixture tree.
    pub fn from_env() -> Self {
        let dir = std::env::var(THERMAL_DIR_ENV).unwrap_or_else(|_| String::from(THERMAL_DIR));
        TemperatureReader { dir: dir.into() }
    }
}

impl SystemReader for TemperatureReader {
    type Reading = f64;
    fn read(&self) -> Result<f64, String> {
        let entries = std::fs::read_dir(&self.dir)
            .map_err(|error| format!("cannot list {}: {error}", self.dir.display()))?;
        let mut highest: Option<f64> = None;
        for entry in entries.filter_map(|entry| entry.ok()) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if !name.starts_with("thermal_zone") {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path().join("temp")) else {
                continue;
            };
            let value = millidegrees_to_celsius(&text)?;
            highest = Some(highest.map_or(value, |best| best.max(value)));
        }
        highest.ok_or_else(|| String::from("no thermal zone found"))
    }
}
`)
    tests.push(`#[test]
fn temperature_is_the_highest_zone_in_celsius() {
    let parsed = millidegrees_to_celsius(" 70400 ");
    assert_eq!(parsed, Ok(70.4));
    assert!(millidegrees_to_celsius("hot").is_err());
    let dir = std::env::temp_dir().join(format!("thermal-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let zones = [
        ("thermal_zone0", "41000"),
        ("thermal_zone1", "63500"),
        ("cooling_device0", "99000"),
    ];
    for (zone, milli) in zones {
        std::fs::create_dir_all(dir.join(zone)).expect("zone dir");
        std::fs::write(dir.join(zone).join("temp"), milli).expect("zone file");
    }
    let reader = TemperatureReader { dir: dir.clone() };
    assert_eq!(reader.read(), Ok(63.5));
    std::fs::remove_dir_all(&dir).expect("cleanup");
    assert!(reader.read().is_err());
}
`)
  }
  const files: WaybarKitSource[] = sources.length === 0 ? [] : [
    { name: "src/platform/system_source.rs", content: parts.join("\n") },
    { name: "tests/system_source_tests.rs", content: `use ${crate}::platform::system_source::*;\n\n${tests.join("\n")}` },
  ]
  if (sizes) {
    files.push({ name: "src/platform/units.rs", content: `/// Decimal SI units, fixed for every size and rate this module shows: 1 kB = 1000 B, 1 Mb = 1,000,000 bits.
/// Decimals are fixed: a size shows 2, a rate shows 1 (a size below 1000 B is a whole number of bytes).
/// Rounding is half away from zero: f64::round of value x 10^decimals, then formatted. Rust's {:.N} on the raw
/// value is never used for a shown number (it rounds the binary value and can round a decimal tie down).
pub const SIZE_DECIMALS: usize = 2;
pub const RATE_DECIMALS: usize = 1;
const SIZE_UNITS: [&str; 5] = ["B", "kB", "MB", "GB", "TB"];
const RATE_UNITS: [&str; 4] = ["b/s", "kb/s", "Mb/s", "Gb/s"];

fn scale(mut value: f64, units: &[&'static str]) -> (f64, &'static str) {
    let mut index = 0;
    while value >= 1000.0 && index + 1 < units.len() {
        value /= 1000.0;
        index += 1;
    }
    (value, units[index])
}

/// Round half away from zero at the given number of decimals (1.25 at 1 decimal is 1.3, -1.25 is -1.3).
pub fn round_half_away(value: f64, decimals: usize) -> f64 {
    let factor = 10f64.powi(decimals as i32);
    (value * factor).round() / factor + 0.0 // + 0.0 turns -0.0 into 0.0
}

/// The number with exactly the given decimals, rounded half away from zero (12.0 at 1 decimal is "12.0").
pub fn format_decimals(value: f64, decimals: usize) -> String {
    format!("{:.decimals$}", round_half_away(value, decimals))
}

/// B below 1000, then kB, MB, GB, TB with the given number of decimals.
pub fn format_size(bytes: u64, decimals: usize) -> String {
    let (value, unit) = scale(bytes as f64, &SIZE_UNITS);
    if unit == "B" {
        format!("{bytes} B")
    } else {
        format!("{} {unit}", format_decimals(value, decimals))
    }
}

/// How many base units (bytes, or bits for b/s, kb/s, Mb/s, Gb/s) one fixed unit holds; None for any other unit.
pub fn unit_divisor(unit: &str) -> Option<f64> {
    let base = unit.strip_suffix("/s").map_or(unit, |bare| bare);
    match base {
        "B" | "b" => Some(1.0),
        "kB" | "kb" => Some(1e3),
        "MB" | "Mb" => Some(1e6),
        "GB" | "Gb" => Some(1e9),
        "TB" => Some(1e12),
        _ => None,
    }
}

/// The bare number of an amount in a fixed unit (500,000 B/s in MB/s is "0.5" at 1 decimal): the unit is the
/// feature's declaration, so the largest-unit choice of format_size and format_bit_rate does not apply.
pub fn format_in_unit(amount: f64, unit: &str, decimals: usize) -> Result<String, String> {
    let divisor = unit_divisor(unit).ok_or_else(|| format!("{unit} is not a size or rate unit"))?;
    Ok(format_decimals(amount / divisor, decimals))
}

/// Bytes per second from a byte change over whole seconds (0 for 0 seconds).
pub fn bytes_per_second(bytes: u64, seconds: u64) -> f64 {
    if seconds == 0 {
        0.0
    } else {
        bytes as f64 / seconds as f64
    }
}

/// Bits per second from a byte change over whole seconds: bytes x 8 / seconds (0 for 0 seconds).
pub fn bits_per_second(bytes: u64, seconds: u64) -> f64 {
    if seconds == 0 {
        0.0
    } else {
        bytes as f64 * 8.0 / seconds as f64
    }
}

/// b/s, kb/s, Mb/s, Gb/s with the given number of decimals.
pub fn format_bit_rate(bits_per_second: f64, decimals: usize) -> String {
    let (value, unit) = scale(bits_per_second, &RATE_UNITS);
    format!("{} {unit}", format_decimals(value, decimals))
}
` })
    files.push({ name: "tests/units_tests.rs", content: `use ${crate}::platform::units::*;

#[test]
fn rates_are_bytes_times_eight_over_seconds_in_decimal_units() {
    // 6,250,000 bytes in 5 seconds is 10,000,000 bits per second.
    assert_eq!(
        format_bit_rate(bits_per_second(6_250_000, 5), 1),
        "10.0 Mb/s"
    );
    assert_eq!(
        format_bit_rate(bits_per_second(3_125_000, 5), 1),
        "5.0 Mb/s"
    );
    assert_eq!(format_bit_rate(bits_per_second(100, 0), 1), "0.0 b/s");
}

#[test]
fn decimals_are_fixed_at_two_for_sizes_and_one_for_rates() {
    assert_eq!(format_size(3_670_016_000, SIZE_DECIMALS), "3.67 GB");
    assert_eq!(format_size(496_330_000_000, SIZE_DECIMALS), "496.33 GB");
    assert_eq!(format_size(500_000_000_000, SIZE_DECIMALS), "500.00 GB");
    assert_eq!(format_bit_rate(10_000_000.0, RATE_DECIMALS), "10.0 Mb/s");
}

#[test]
fn rounding_is_half_away_from_zero_not_the_binary_format() {
    assert_eq!(format_decimals(1.25, 1), "1.3");
    assert_eq!(format_decimals(-1.25, 1), "-1.3");
    assert_eq!(format_decimals(12.0, 1), "12.0");
    assert_eq!(format_decimals(0.04, 1), "0.0");
    assert_eq!(format_decimals(2.5, 0), "3");
    assert_eq!(round_half_away(0.35, 1), 0.4);
    // 6,250,000 bytes in 5 seconds is 1,250,000 B/s, shown as 1.3 MB/s.
    assert_eq!(
        format_in_unit(bytes_per_second(6_250_000, 5), "MB/s", 1),
        Ok(String::from("1.3"))
    );
}

#[test]
fn a_fixed_unit_scales_to_that_unit_and_never_picks_another() {
    assert_eq!(
        format_in_unit(500_000.0, "MB/s", 1),
        Ok(String::from("0.5"))
    );
    assert_eq!(format_in_unit(0.0, "MB/s", 1), Ok(String::from("0.0")));
    assert_eq!(
        format_in_unit(2_500_000_000.0, "MB", 2),
        Ok(String::from("2500.00"))
    );
    assert_eq!(
        format_in_unit(10_000_000.0, "Mb/s", 1),
        Ok(String::from("10.0"))
    );
    assert!(format_in_unit(1.0, "km/h", 1).is_err());
    assert_eq!(bytes_per_second(100, 0), 0.0);
}

#[test]
fn sizes_use_a_1000_base_and_label_the_largest_unit() {
    assert_eq!(format_size(3_670_016_000, 2), "3.67 GB");
    assert_eq!(format_size(999, 2), "999 B");
    assert_eq!(format_size(1000, 2), "1.00 kB");
    assert_eq!(format_size(1_500_000, 1), "1.5 MB");
}
` })
  }
  return files
}

// The one place the time-zone rule lives: instants are stored as UTC epoch milliseconds and converted only here.
export function waybarLocalTimeKit(crate: string): WaybarKitSource[] {
  return [
    { name: "src/platform/local_time.rs", content: `use chrono::{DateTime, FixedOffset, Local, TimeZone};

/// HH:MM, 24-hour, zero-padded, for a UTC epoch in milliseconds seen at a fixed UTC offset in seconds.
pub fn clock_at_offset(epoch_ms: i64, offset_seconds: i32) -> Option<String> {
    let offset = FixedOffset::east_opt(offset_seconds)?;
    let instant: DateTime<FixedOffset> = offset.timestamp_millis_opt(epoch_ms).single()?;
    Some(instant.format("%H:%M").to_string())
}

/// HH:MM in the user's local time zone (the system time zone) for a UTC epoch in milliseconds; the only
/// place a stored instant becomes a local time.
pub fn local_clock(epoch_ms: i64) -> Option<String> {
    let instant = Local.timestamp_millis_opt(epoch_ms).single()?;
    Some(instant.format("%H:%M").to_string())
}
` },
    { name: "tests/local_time_tests.rs", content: `use ${crate}::platform::local_time::*;

#[test]
fn an_instant_is_shown_as_zero_padded_24_hour_time_at_the_offset() {
    // 2026-06-21T03:05:00Z
    let epoch_ms = 1_782_011_100_000;
    assert_eq!(clock_at_offset(epoch_ms, 0).as_deref(), Some("03:05"));
    assert_eq!(
        clock_at_offset(epoch_ms, 2 * 3600).as_deref(),
        Some("05:05")
    );
    assert_eq!(
        clock_at_offset(epoch_ms, -8 * 3600).as_deref(),
        Some("19:05")
    );
    assert!(clock_at_offset(epoch_ms, 100_000).is_none());
}

#[test]
fn the_local_clock_is_always_hh_mm() {
    let text = local_clock(1_782_011_100_000).expect("local time");
    assert_eq!(text.len(), 5);
    assert_eq!(&text[2..3], ":");
}
` },
  ]
}
