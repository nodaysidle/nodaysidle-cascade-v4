use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    fmt::Write as FmtWrite,
    fs::{self, File, OpenOptions},
    io::{self, Write as IoWrite},
    path::{Path, PathBuf},
    process::{Command, ExitStatus, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    thread,
    time::{Duration, Instant},
};

pub const DOCUMENT_NAMES: [&str; 5] = ["PRD.md", "ARD.md", "TRD.md", "TASKS.md", "AGENTS.md"];
const MAX_EXPORT_FILE_BYTES: usize = 2_000_000;
// A preset's starter kit follows the five documents, only under kit/ and in plain relative paths.
const KIT_PREFIX: &str = "kit/";
const MAX_KIT_FILES: usize = 64;
// Android source paths run 10+ segments (app/src/main/java/<package>/...).
const MAX_KIT_PATH_DEPTH: usize = 16;
// The validated provider blueprint, exported next to the documents for audits.
const BLUEPRINT_FILE_NAME: &str = "blueprint.json";
static STAGING_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFile {
    pub name: String,
    pub content: String,
    pub sha256: String,
}

#[derive(Debug, Serialize)]
pub struct ExportFailure {
    pub kind: &'static str,
    pub classification: &'static str,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KitBuildWireResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output: Option<String>,
}

impl ExportFailure {
    fn invalid_packet() -> Self {
        Self {
            kind: "invalid-packet",
            classification: "export-gate-failure",
        }
    }

    pub(crate) fn invalid_destination() -> Self {
        Self {
            kind: "invalid-destination",
            classification: "export-destination-failure",
        }
    }

    pub(crate) fn write_failure() -> Self {
        Self {
            kind: "write",
            classification: "export-write-failure",
        }
    }
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let mut hex = String::with_capacity(64);
    for byte in Sha256::digest(bytes) {
        FmtWrite::write_fmt(&mut hex, format_args!("{byte:02x}"))
            .expect("writing to a String cannot fail");
    }
    hex
}

pub fn validate_export_files(files: &[ExportFile]) -> Result<(), ExportFailure> {
    if files.len() < DOCUMENT_NAMES.len() || files.len() > DOCUMENT_NAMES.len() + MAX_KIT_FILES + 1
    {
        return Err(ExportFailure::invalid_packet());
    }
    for (file, expected_name) in files.iter().zip(DOCUMENT_NAMES) {
        if file.name != expected_name || !valid_content(file) {
            return Err(ExportFailure::invalid_packet());
        }
    }
    let mut extra_names = HashSet::new();
    for file in &files[DOCUMENT_NAMES.len()..] {
        let allowed_name = file.name == BLUEPRINT_FILE_NAME || valid_kit_path(&file.name);
        if !allowed_name || !valid_content(file) || !extra_names.insert(file.name.as_str()) {
            return Err(ExportFailure::invalid_packet());
        }
    }
    Ok(())
}

fn valid_content(file: &ExportFile) -> bool {
    !file.content.trim().is_empty()
        && file.content.len() <= MAX_EXPORT_FILE_BYTES
        && file.sha256 == sha256_hex(file.content.as_bytes())
}

fn valid_kit_path(name: &str) -> bool {
    let Some(relative) = name.strip_prefix(KIT_PREFIX) else {
        return false;
    };
    let parts: Vec<&str> = relative.split('/').collect();
    parts.len() <= MAX_KIT_PATH_DEPTH
        && parts.iter().all(|part| {
            !part.is_empty()
                && !part.starts_with('.')
                && part
                    .bytes()
                    // `[` and `]` are Astro dynamic routes such as src/pages/books/[slug].astro.
                    .all(|byte| byte.is_ascii_alphanumeric() || b"._-+[]".contains(&byte))
        })
}

pub fn write_packet_atomic(
    parent: &Path,
    slug: &str,
    files: &[ExportFile],
) -> Result<PathBuf, ExportFailure> {
    validate_export_files(files)?;
    if !valid_slug(slug) {
        return Err(ExportFailure::invalid_destination());
    }
    let parent = parent
        .canonicalize()
        .map_err(|_| ExportFailure::invalid_destination())?;
    if !parent.is_dir() {
        return Err(ExportFailure::invalid_destination());
    }
    let destination = parent.join(slug);
    if destination.exists() {
        return Err(ExportFailure::invalid_destination());
    }

    let staging = create_staging_directory(&parent, slug)?;
    let write_result = write_staging_packet(&staging, files);
    if write_result.is_err() {
        let _cleanup = fs::remove_dir_all(&staging);
        return Err(ExportFailure::write_failure());
    }
    if rename_exclusive(&staging, &destination).is_err() {
        let _cleanup = fs::remove_dir_all(&staging);
        return Err(ExportFailure::write_failure());
    }
    if verify_written_packet(&destination, files).is_err() {
        let _cleanup = fs::remove_dir_all(&destination);
        return Err(ExportFailure::write_failure());
    }
    if let Ok(directory) = File::open(&parent) {
        let _sync_result = directory.sync_all();
    }
    Ok(destination)
}

fn rename_exclusive(from: &Path, to: &Path) -> io::Result<()> {
    {
        use std::ffi::CString;
        use std::os::raw::{c_char, c_int, c_uint};
        use std::os::unix::ffi::OsStrExt;
        const AT_FDCWD: c_int = -100;
        const RENAME_NOREPLACE: c_uint = 1;
        extern "C" {
            // glibc 2.28+; fails with EEXIST instead of replacing a destination that appeared after the exists() check.
            fn renameat2(
                olddirfd: c_int,
                oldpath: *const c_char,
                newdirfd: c_int,
                newpath: *const c_char,
                flags: c_uint,
            ) -> c_int;
        }
        let from_c = CString::new(from.as_os_str().as_bytes())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "export path"))?;
        let to_c = CString::new(to.as_os_str().as_bytes())
            .map_err(|_| io::Error::new(io::ErrorKind::InvalidInput, "export path"))?;
        let rc = unsafe {
            renameat2(
                AT_FDCWD,
                from_c.as_ptr(),
                AT_FDCWD,
                to_c.as_ptr(),
                RENAME_NOREPLACE,
            )
        };
        if rc == 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
}

fn verify_written_packet(destination: &Path, files: &[ExportFile]) -> io::Result<()> {
    for file in files {
        let bytes = fs::read(destination.join(&file.name))?;
        if sha256_hex(&bytes) != file.sha256 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "export hash mismatch",
            ));
        }
    }
    Ok(())
}

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.split('-').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit())
        })
}

fn create_staging_directory(parent: &Path, slug: &str) -> Result<PathBuf, ExportFailure> {
    for _ in 0..16 {
        let sequence = STAGING_COUNTER.fetch_add(1, Ordering::Relaxed);
        let staging = parent.join(format!(
            ".cascade-{slug}-{}-{sequence}.staging",
            std::process::id()
        ));
        match fs::create_dir(&staging) {
            Ok(()) => return Ok(staging),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(ExportFailure::write_failure()),
        }
    }
    Err(ExportFailure::write_failure())
}

fn write_staging_packet(staging: &Path, files: &[ExportFile]) -> io::Result<()> {
    for file in files {
        let path = staging.join(&file.name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        output.write_all(file.content.as_bytes())?;
        output.sync_all()?;
        // Kit scripts are exported ready to run.
        #[cfg(unix)]
        if file.name.starts_with(KIT_PREFIX) && file.name.ends_with(".sh") {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o755))?;
        }
    }
    File::open(staging)?.sync_all()
}

fn kit_commands_for_preset(preset_id: &str) -> Option<&'static [&'static [&'static str]]> {
    const GTK_WAYBAR: &[&[&str]] = &[
        &["cargo", "fmt", "--check"],
        &[
            "cargo",
            "clippy",
            "--all-targets",
            "--all-features",
            "--",
            "-D",
            "warnings",
        ],
        &["cargo", "test"],
    ];
    const ASTRO: &[&[&str]] = &[
        &["npm", "install", "--no-audit", "--no-fund"],
        &["npm", "run", "check"],
        &["npm", "run", "build"],
        &["npm", "test"],
        &["npm", "run", "test:a11y"],
        &["npm", "run", "audit:performance"],
    ];
    const TAURI: &[&[&str]] = &[
        &["npm", "install", "--no-audit", "--no-fund"],
        &["npm", "run", "typecheck"],
        &["npm", "test"],
        &["npm", "run", "build"],
        &["npm", "run", "tauri", "--", "icon", "app-icon.svg"],
        &[
            "cargo",
            "fmt",
            "--manifest-path",
            "src-tauri/Cargo.toml",
            "--",
            "--check",
        ],
        &["cargo", "test", "--manifest-path", "src-tauri/Cargo.toml"],
    ];
    const ANDROID: &[&[&str]] = &[&["./scripts/gradle.sh", "assembleDebug", "testDebugUnitTest"]];

    match preset_id {
        "linux-wayland-gtk4-desktop" | "linux-hyprland-waybar-module" => Some(GTK_WAYBAR),
        "astro-web" => Some(ASTRO),
        "tauri2-rust-typescript-desktop" => Some(TAURI),
        "android-kotlin-compose" => Some(ANDROID),
        _ => None,
    }
}

// Kit build commands run generated code: they must not inherit these variables.
const KIT_BUILD_ENV_SCRUB: [&str; 4] = [
    "DEEPSEEK_API_KEY",
    "TYPESAFE_API_KEY",
    "ANTHROPIC_API_KEY",
    "CASCADE_API_URL",
];
const KIT_BUILD_TIMEOUT: Duration = Duration::from_secs(20 * 60);

// Runs the command with stdout and stderr in files in its working directory (the temporary work
// directory), kills it when the limit passes, and returns the exit status and both outputs.
fn run_with_timeout(command: &mut Command, limit: Duration) -> io::Result<(ExitStatus, String)> {
    let dir = command
        .get_current_dir()
        .map_or_else(std::env::temp_dir, Path::to_path_buf);
    let stdout_path = dir.join(".cascade-build-stdout");
    let stderr_path = dir.join(".cascade-build-stderr");
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::from(File::create(&stdout_path)?))
        .stderr(Stdio::from(File::create(&stderr_path)?))
        .spawn()?;
    let start = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait()? {
            break status;
        }
        if start.elapsed() >= limit {
            let _ = child.kill();
            let _ = child.wait();
            return Err(io::Error::new(io::ErrorKind::TimedOut, "build timed out"));
        }
        thread::sleep(Duration::from_millis(200));
    };
    let read = |path: &Path| fs::read(path).map(|b| String::from_utf8_lossy(&b).into_owned());
    Ok((
        status,
        format!("{}\n{}", read(&stdout_path)?, read(&stderr_path)?),
    ))
}

pub fn build_kit_in_temp(
    preset_id: &str,
    files: &[ExportFile],
) -> Result<KitBuildWireResult, ExportFailure> {
    let Some(commands) = kit_commands_for_preset(preset_id) else {
        return Err(ExportFailure::invalid_packet());
    };
    if files.is_empty() || files.len() > MAX_KIT_FILES {
        return Err(ExportFailure::invalid_packet());
    }
    let mut names = HashSet::new();
    for file in files {
        if !valid_kit_path(&file.name) || !valid_content(file) || !names.insert(file.name.as_str())
        {
            return Err(ExportFailure::invalid_packet());
        }
    }

    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir);
    let cache_root = home.join(".cache").join("cascade-v4");
    let cargo_target_dir = cache_root.join("target");
    let cache_tmp_dir = cache_root.join("tmp");
    fs::create_dir_all(&cargo_target_dir).map_err(|_| ExportFailure::write_failure())?;
    fs::create_dir_all(&cache_tmp_dir).map_err(|_| ExportFailure::write_failure())?;
    let work_dir = create_staging_directory(&cache_tmp_dir, "kit-build")?;

    let result = (|| -> Result<KitBuildWireResult, ExportFailure> {
        for file in files {
            let relative = file.name.strip_prefix(KIT_PREFIX).unwrap_or(&file.name);
            let target = work_dir.join(relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|_| ExportFailure::write_failure())?;
            }
            fs::write(&target, file.content.as_bytes())
                .map_err(|_| ExportFailure::write_failure())?;
            #[cfg(unix)]
            if file.name.ends_with(".sh") {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&target, fs::Permissions::from_mode(0o755))
                    .map_err(|_| ExportFailure::write_failure())?;
            }
        }
        let android_home = std::env::var_os("ANDROID_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("Android").join("Sdk"));
        for args in commands {
            let command_text = args.join(" ");
            let mut command = Command::new(args[0]);
            command
                .args(&args[1..])
                .current_dir(&work_dir)
                .env("CARGO_TARGET_DIR", &cargo_target_dir)
                .env("TMPDIR", &cache_tmp_dir)
                .env("ANDROID_HOME", &android_home);
            for name in KIT_BUILD_ENV_SCRUB {
                command.env_remove(name);
            }
            match run_with_timeout(&mut command, KIT_BUILD_TIMEOUT) {
                Ok((status, _)) if status.success() => continue,
                Ok((_, combined)) => {
                    let tail: Vec<&str> = combined.trim().lines().rev().take(15).collect();
                    let tail_text = tail.into_iter().rev().collect::<Vec<_>>().join("\n");
                    return Ok(KitBuildWireResult {
                        ok: false,
                        command: Some(command_text),
                        output: Some(tail_text),
                    });
                }
                Err(err) => {
                    let output = if err.kind() == io::ErrorKind::TimedOut {
                        "timed out after 20 minutes".to_string()
                    } else {
                        err.to_string()
                    };
                    return Ok(KitBuildWireResult {
                        ok: false,
                        command: Some(command_text),
                        output: Some(output),
                    });
                }
            }
        }
        Ok(KitBuildWireResult {
            ok: true,
            command: None,
            output: None,
        })
    })();

    let _cleanup = fs::remove_dir_all(&work_dir);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file(name: &str, content: &str) -> ExportFile {
        ExportFile {
            name: name.to_string(),
            content: content.to_string(),
            sha256: sha256_hex(content.as_bytes()),
        }
    }

    #[test]
    fn kit_build_scrubs_exactly_the_four_names() {
        assert_eq!(
            KIT_BUILD_ENV_SCRUB,
            [
                "DEEPSEEK_API_KEY",
                "TYPESAFE_API_KEY",
                "ANTHROPIC_API_KEY",
                "CASCADE_API_URL"
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn run_with_timeout_returns_status_and_output() {
        let dir = create_staging_directory(&std::env::temp_dir(), "timeout-test").unwrap();
        let mut command = Command::new("sh");
        command.args(["-c", "echo hi; exit 3"]).current_dir(&dir);
        let (status, output) = run_with_timeout(&mut command, Duration::from_secs(10)).unwrap();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(status.code(), Some(3));
        assert!(output.contains("hi"));
    }

    #[cfg(unix)]
    #[test]
    fn run_with_timeout_kills_a_slow_command() {
        let dir = create_staging_directory(&std::env::temp_dir(), "timeout-test").unwrap();
        let mut command = Command::new("sh");
        command.args(["-c", "sleep 5"]).current_dir(&dir);
        let start = Instant::now();
        let error = run_with_timeout(&mut command, Duration::from_millis(300)).unwrap_err();
        let _ = fs::remove_dir_all(&dir);
        assert_eq!(error.kind(), io::ErrorKind::TimedOut);
        assert!(start.elapsed() < Duration::from_secs(4));
    }

    #[cfg(unix)]
    #[test]
    fn run_with_timeout_gives_the_command_no_stdin() {
        let dir = create_staging_directory(&std::env::temp_dir(), "timeout-test").unwrap();
        let mut command = Command::new("sh");
        command.args(["-c", "cat"]).current_dir(&dir);
        let start = Instant::now();
        let result = run_with_timeout(&mut command, Duration::from_secs(5));
        let _ = fs::remove_dir_all(&dir);
        assert!(result.unwrap().0.success());
        assert!(start.elapsed() < Duration::from_secs(3));
    }

    fn packet(extra: &[&str]) -> Vec<ExportFile> {
        DOCUMENT_NAMES
            .iter()
            .chain(extra)
            .map(|name| file(name, "content\n"))
            .collect()
    }

    #[test]
    fn accepts_android_and_astro_kit_paths() {
        for path in [
            "kit/app/src/main/java/com/steady/day/data/SettingsRepository.kt",
            "kit/src/pages/featured-book/[slug].astro",
            "kit/gradle/libs.versions.toml",
        ] {
            assert!(valid_kit_path(path), "{path}");
        }
        assert!(validate_export_files(&packet(&[
            "kit/app/src/main/java/com/steady/day/data/SettingsRepository.kt",
            "kit/src/pages/guides/[slug].astro",
            BLUEPRINT_FILE_NAME,
        ]))
        .is_ok());
    }

    #[test]
    fn rejects_traversal_dotfiles_and_bad_names() {
        for path in [
            "kit/../escape.txt",
            "kit/a/../../escape.txt",
            "kit/.env",
            "kit/a/.hidden/file",
            "kit//double",
            "kit/",
            "/etc/passwd",
            "notkit/file",
            "kit/a b.txt",
            "kit/a\\b.txt",
            "kit/1/2/3/4/5/6/7/8/9/10/11/12/13/14/15/16/17.txt",
        ] {
            assert!(!valid_kit_path(path), "{path}");
        }
    }

    #[test]
    fn rejects_bad_hash_duplicates_order_and_too_many_files() {
        let mut bad_hash = packet(&["kit/a.txt"]);
        bad_hash[5].sha256 = "0".repeat(64);
        assert!(validate_export_files(&bad_hash).is_err());
        assert!(validate_export_files(&packet(&["kit/a.txt", "kit/a.txt"])).is_err());
        let mut swapped = packet(&[]);
        swapped.swap(0, 1);
        assert!(validate_export_files(&swapped).is_err());
        let mut names: Vec<String> = (0..=MAX_KIT_FILES)
            .map(|i| format!("kit/f{i}.txt"))
            .collect();
        names.push(BLUEPRINT_FILE_NAME.to_string());
        let refs: Vec<&str> = names.iter().map(String::as_str).collect();
        assert!(validate_export_files(&packet(&refs)).is_err());
        assert!(validate_export_files(&packet(&refs[1..])).is_ok());
    }

    #[test]
    fn exclusive_rename_never_replaces_a_destination() {
        let parent = tempfile::tempdir().expect("tempdir");
        let from = parent.path().join("staging");
        let to = parent.path().join("packet");
        fs::create_dir(&from).expect("staging");
        // An empty directory is what a plain rename(2) silently replaces.
        fs::create_dir(&to).expect("racing destination");
        assert!(rename_exclusive(&from, &to).is_err());
        assert!(from.is_dir(), "staging must be left in place");
        let fresh = parent.path().join("fresh");
        rename_exclusive(&from, &fresh).expect("rename to a new name");
        assert!(fresh.is_dir() && !from.exists());
    }

    #[test]
    fn writes_once_and_refuses_an_existing_destination() {
        let parent = tempfile::tempdir().expect("tempdir");
        let files = packet(&["kit/scripts/run.sh", BLUEPRINT_FILE_NAME]);
        let destination = write_packet_atomic(parent.path(), "demo-app", &files).expect("export");
        assert_eq!(
            fs::read_to_string(destination.join("kit/scripts/run.sh")).expect("kit file"),
            "content\n"
        );
        assert!(write_packet_atomic(parent.path(), "demo-app", &files).is_err());
        assert!(write_packet_atomic(parent.path(), "../demo", &files).is_err());
        let leftovers = fs::read_dir(parent.path())
            .expect("list")
            .filter(|entry| {
                entry
                    .as_ref()
                    .is_ok_and(|e| e.file_name().to_string_lossy().ends_with(".staging"))
            })
            .count();
        assert_eq!(leftovers, 0);
    }
}
