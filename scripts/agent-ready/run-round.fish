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
# Round 12 (2026-11-10): five new ideas per preset, each a different screen or data shape (see HANDOFF round 12 table).
# GTK: app-stamped date + derived due list, edit + streak, import from a chosen file, countdown + notification, settings only.
g linux-wayland-gtk4-desktop "Plant Care keeps the user's house plants. The user adds a plant with a name, a room, and a watering interval in days, presses Watered today on a plant to record that it was watered today, and sees which plants are due for watering today. The user can delete a plant after confirming. Plants are stored on the device and restored after restart."
g linux-wayland-gtk4-desktop "Habit Streak keeps daily habits. The user adds a habit with a name, marks a habit as done for today, renames a habit, and sees for each habit how many days in a row it has been done up to today. Habits and the days they were done are stored on the device and restored after restart."
g linux-wayland-gtk4-desktop "Word Bank keeps vocabulary words. The user imports words from a plain text file the user chooses, one word per line, skipping words already in the list, adds a meaning to a word, and searches words by text. Words are stored on the device and restored after restart."
g linux-wayland-gtk4-desktop "Focus Timer runs 25-minute focus sessions. The user starts, pauses, and resets the timer, sees the minutes and seconds left, and gets a desktop notification when a session ends. The app shows how many sessions were completed today. Completed sessions are stored on the device and restored after restart."
g linux-wayland-gtk4-desktop "Quiet Hours lets the user set a start time and an end time for quiet hours and shows whether the current time is inside quiet hours, including when the period crosses midnight. The two times are stored on the device and restored after restart."
# Waybar: battery, disk space, network rate, public API with a saved setting, load average.
g linux-hyprland-waybar-module "Battery Watch shows the battery percentage in a Waybar module, turns the text amber below 30 percent and red below 15 percent, and reads the battery every 30 seconds. Clicking the module opens a desktop notification saying whether the battery is charging or discharging."
g linux-hyprland-waybar-module "Disk Free shows the free space of the root file system in gigabytes with one decimal in a Waybar module and turns red when less than 10 gigabytes are free. It reads the value every 60 seconds. The tooltip shows the used percentage."
g linux-hyprland-waybar-module "Net Rate shows the network download rate in kilobytes per second in a Waybar module, reading it every 2 seconds. Clicking the module opens a desktop notification with the total data received since the module started."
g linux-hyprland-waybar-module "Weather Bar shows the current outdoor temperature for a saved latitude and longitude in a Waybar module, using the free Open-Meteo forecast API, refreshed every 10 minutes. The user sets the latitude and longitude with a command. Clicking the module opens the Open-Meteo page for that location in the browser."
g linux-hyprland-waybar-module "Load Meter shows the 1-minute system load average with two decimals in a Waybar module, turns amber above 2.00 and red above 4.00, and reads it every 5 seconds. The tooltip shows the 5-minute and 15-minute load averages."
# Tauri: categories + monthly totals, tags + search + open link, tray countdown, one entry per day + export, clipboard watch.
g tauri2-rust-typescript-desktop "Budget Book keeps expenses. The user adds an expense with an amount in euros with two decimals, a category of food, rent, travel, or other, and a date, deletes an expense after confirming, and sees the total per category for the current month. Expenses are stored on the device and restored after restart."
g tauri2-rust-typescript-desktop "Link Shelf keeps bookmarks. The user adds a bookmark with a title, a web address, and comma-separated tags, searches bookmarks by title or tag, and opens a bookmark in the default browser. Bookmarks are stored on the device and restored after restart."
g tauri2-rust-typescript-desktop "Meeting Clock is a countdown timer for meetings. The user picks 15, 30, or 60 minutes and starts the countdown; the remaining minutes show in the window and in the system tray, and a desktop notification appears when the time is up. The last chosen duration is stored on the device and restored after restart."
g tauri2-rust-typescript-desktop "Day Journal keeps one journal entry per day. The user writes or edits today's entry, browses earlier days newest first, and saves all entries to a Markdown file the user chooses. Entries are stored on the device and restored after restart."
g tauri2-rust-typescript-desktop "Clip Keeper remembers text the user copies. While the app runs it keeps the last 50 copied texts, newest first, and the user clicks one to copy it back to the clipboard or clears the whole history. The history is stored on the device and restored after restart."
# Astro: grouped list + filter pages, sorted portfolio, date-based events, two linked collections, menu with prices and a flag.
g astro-web "Green Kitchen is a recipe website. It has a home page listing every recipe, one page per recipe with its ingredients and steps, and one page per meal type (breakfast, lunch, or dinner) listing the recipes of that type."
g astro-web "Studio Folio is a portfolio website for a designer. It has a home page listing projects newest year first and one page per project with the project name, the year, the client, the role, and a link to the live project."
g astro-web "Town Events is a website for a community center. It has a home page listing upcoming events soonest first with the date, time, and venue, hides events whose date has passed at build time, and has one page per event."
g astro-web "Field Notes is a blog with several authors. It has a home page listing posts newest first, one page per post showing its author, and one page per author listing that author's posts."
g astro-web "Corner Cafe is a website for a cafe. It has one menu page with dishes grouped into starters, mains, and desserts, each dish with a name, a price in euros with two decimals, and a vegetarian mark, plus an about page with the opening hours."
# Android: check off + bulk clear, edit/delete with decimals, scheduled notification, days-until derived, no storage at all.
g android-kotlin-compose "Shopping List keeps items to buy. The user adds an item with a name and a quantity, checks an item off, and clears all checked items at once. Items are stored on the device and restored after restart."
g android-kotlin-compose "Lift Log records gym workouts. The user adds a set with an exercise name, a weight in kilograms with one decimal, a number of repetitions, and today's date, edits or deletes a set, and sees the sets newest first. Sets are stored on the device and restored after restart."
g android-kotlin-compose "Drink Reminder shows a daily notification at a time the user chooses reminding them to drink water. The user sets the time and turns the reminder on or off. The settings are stored on the device and restored after restart."
g android-kotlin-compose "Days Until counts down to events. The user adds an event with a name and a date, sees each event with the number of days left until it, nearest first, and deletes an event. Events are stored on the device and restored after restart."
g android-kotlin-compose "Tip Split is a calculator. The user enters a bill amount, picks a tip of 10, 15, or 20 percent, and enters the number of people, and the screen shows the tip, the total, and the amount per person rounded to two decimals. Nothing is stored."

# Round 11 (2026-11-10), already run (kept for history; do not reuse):
# each idea exercises a round-10 fix (export button, fixed choices, single setting).
# g linux-wayland-gtk4-desktop "Book Shelf keeps books the user has read. The user adds a book with a title, an author, and a rating from 1 to 5, marks a book as a favorite, and saves all books to a CSV file the user chooses. Books are stored on the device and restored after restart."
# g linux-hyprland-waybar-module "Temp Watch shows the CPU temperature in degrees Celsius in a Waybar module and turns the text amber above 70 degrees and red above 85 degrees. It reads the value from the system every 5 seconds. Clicking the module opens a desktop notification with the current temperature and the highest temperature since the module started."
# g tauri2-rust-typescript-desktop "Reading List keeps articles to read later with a title, a link, and a status of unread, reading, or done. The user adds an article, changes its status, filters the list by status, and saves all articles to a CSV file the user chooses. Articles are stored on the device and restored after restart."
# g astro-web "Board Game Club is a website for a board game club. It has a home page listing every game in the club library and one page per game with the game name, the number of players, the play time in minutes, and its weight (light, medium, or heavy)."
# g android-kotlin-compose "Step Goal helps a person walk more. The user enters the steps walked today, sets a daily step goal, and sees whether today's steps reach the goal. Entries are stored on the device and restored after restart."
