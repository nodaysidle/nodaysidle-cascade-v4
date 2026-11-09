# Generate one packet per idea live (needs DEEPSEEK_API_KEY and TYPESAFE_API_KEY in the fish environment).
# Usage: fish scripts/agent-ready/run-round.fish /tmp/v4-roundN
# Edit the g lines below (one per idea). Never reuse an idea from an earlier round: new ideas test generalization.
cd (dirname (status filename))/../..
set out $argv[1]
rm -rf $out
function g
  echo "=== $argv[1]"
  npm run -s cascade -- generate --preset $argv[1] --idea $argv[2] --out $out/$argv[1] 2>&1 | grep -vE 'DEP0205|trace-dep' | cut -c1-300 | head -14
end
g linux-wayland-gtk4-desktop "Example Notes keeps short notes. The user adds a note with a title and a text, edits a note, searches notes by title, and deletes a note after confirming. Notes are stored on the device and restored after restart."
g linux-hyprland-waybar-module "Example Load shows the one-minute load average in a Waybar module and turns the text amber above 2.0 and red above 4.0. It reads the value from the system every 10 seconds. Clicking the module opens a desktop notification with the five and fifteen minute load averages."
g tauri2-rust-typescript-desktop "Example Cards keeps flash cards. The user adds a card with a question and an answer, edits a card, searches cards by question, and deletes a card after confirming. Cards are stored on the device and restored after restart."
g astro-web "Example Shop is a website for a small shop. It has a home page with the list of products with name and price, one page per product with its description, and an about page. The site collects no visitor data and has no forms."
g android-kotlin-compose "Example Habits helps a person keep habits. The user adds a habit with a name, marks a habit as done today, and sees how many habits are done today. Habits are stored on the device and restored after restart."
