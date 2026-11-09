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
g linux-wayland-gtk4-desktop "Recipe Box keeps cooking recipes. The user adds a recipe with a name, the ingredients as text, and a cooking time in minutes, edits a recipe, filters recipes by name, and deletes a recipe after confirming. Recipes are stored on the device and restored after restart."
g linux-wayland-gtk4-desktop "Plant Water reminds a person to water house plants. The user adds a plant with a name and a watering interval in days, marks a plant as watered today, and sees which plants are due today or overdue. Plants are stored on the device and restored after restart."
g linux-hyprland-waybar-module "Memory Watch shows used memory as a percentage in a Waybar module and turns the text amber above 75 percent and red above 90 percent. It reads the value from the system every 5 seconds. Clicking the module opens a desktop notification with used and total memory in gigabytes."
g linux-hyprland-waybar-module "Battery Pace shows the battery charge as a percentage in a Waybar module and turns the text amber below 30 percent and red below 15 percent. It reads the value from the system every 30 seconds. Clicking the module opens a desktop notification that says whether the charger is connected."
g tauri2-rust-typescript-desktop "Expense Notes keeps personal expenses. The user adds an expense with a date, an amount, and a category, edits an expense, sees the total for the current month, and deletes an expense after confirming. Expenses are stored on the device and restored after restart."
g tauri2-rust-typescript-desktop "Contact Book keeps contacts with a name, a phone number, and an email address. The user adds and edits a contact, searches contacts by name, and saves all contacts to a CSV file the user chooses. Contacts are stored on the device and restored after restart."
g astro-web "Trail Guide is a website about local hiking trails. It has a home page listing the trails with name, length in kilometers, and difficulty, one page per trail with its description and starting point, and an about page. The site collects no visitor data and has no forms."
g astro-web "Bakery Menu is a website for a small bakery. It has a home page with the opening hours, a menu page listing breads and pastries with name and price, and a contact page with the address and phone number. The site collects no visitor data and has no forms."
g android-kotlin-compose "Water Log helps a person drink enough water. The user logs a glass of water with one tap, sets a daily goal in glasses, and sees how many glasses are logged today. Logs are stored on the device and restored after restart."
g android-kotlin-compose "Parking Spot remembers where the car is parked. The user saves a spot with a level, a row, and a note, sees the last saved spot, and clears it when leaving. The spot is stored on the device and restored after restart."
