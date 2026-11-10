# Generate one packet per idea live (needs DEEPSEEK_API_KEY and TYPESAFE_API_KEY in the fish environment).
# Usage: fish scripts/agent-ready/run-round.fish /tmp/v4-roundN
# Edit the g lines below (one per idea). Never reuse an idea from an earlier round: new ideas test generalization.
cd (dirname (status filename))/../..
# The folder is deleted first, so accept only a path under /tmp.
if test (count $argv) -ne 1; or not string match -qr '^/tmp/[^/]+' -- $argv[1]; or string match -q '*..*' -- $argv[1]
  echo "usage: fish scripts/agent-ready/run-round.fish /tmp/v4-roundN" >&2
  exit 1
end
set out $argv[1]
rm -rf -- $out
function g
  echo "=== $argv[1]"
  npm run -s cascade -- generate --preset $argv[1] --idea $argv[2] --out $out/$argv[1] 2>&1 | grep -vE 'DEP0205|trace-dep' | cut -c1-300 | head -14
end
# Round 11 (2026-11-10): each idea exercises a round-10 fix (export button, fixed choices, single setting).
g linux-wayland-gtk4-desktop "Book Shelf keeps books the user has read. The user adds a book with a title, an author, and a rating from 1 to 5, marks a book as a favorite, and saves all books to a CSV file the user chooses. Books are stored on the device and restored after restart."
g linux-hyprland-waybar-module "Temp Watch shows the CPU temperature in degrees Celsius in a Waybar module and turns the text amber above 70 degrees and red above 85 degrees. It reads the value from the system every 5 seconds. Clicking the module opens a desktop notification with the current temperature and the highest temperature since the module started."
g tauri2-rust-typescript-desktop "Reading List keeps articles to read later with a title, a link, and a status of unread, reading, or done. The user adds an article, changes its status, filters the list by status, and saves all articles to a CSV file the user chooses. Articles are stored on the device and restored after restart."
g astro-web "Board Game Club is a website for a board game club. It has a home page listing every game in the club library and one page per game with the game name, the number of players, the play time in minutes, and its weight (light, medium, or heavy)."
g android-kotlin-compose "Step Goal helps a person walk more. The user enters the steps walked today, sets a daily step goal, and sees whether today's steps reach the goal. Entries are stored on the device and restored after restart."
