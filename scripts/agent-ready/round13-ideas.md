# Round 13 ideas (written 2026-11-11, never used before)

Five ideas per preset for a live run in the desktop app, built from `main` at `3e2f5c6`. The exported packets
do not record the idea text, so an audit of a round-13 packet reads the idea from this file. Leave the preset
options at their defaults and keep "Include blueprint.json" on when exporting.

What each idea is meant to exercise is in brackets after its name; that note is not part of the idea text.

## linux-wayland-gtk4-desktop

G1 Room Paint [calculator, nothing stored, decimal choice options]

Room Paint is a calculator for wall paint. The user enters the wall width and the wall height in metres with one decimal, picks the number of coats from 1, 2, or 3, and picks the coverage of the paint from 8.5, 10, or 12.5 square metres per litre. The window shows the litres needed, rounded up to one decimal. Nothing is stored.

G2 Gift Ledger [list with a status filter and a total]

Gift Ledger keeps gift ideas. The user adds a gift with a person's name, a description, a price in euros with two decimals, and a status of idea, bought, or given, edits a gift, and deletes a gift after confirming. The user filters the list by status, and the window shows the total price of the gifts with the status bought. Gifts are stored on the device and restored after restart.

G3 Stretch Break [repeating timer, notification, one stored setting]

Stretch Break reminds the user to stretch. The user picks an interval of 20, 40, or 60 minutes and presses Start; the window shows the minutes and seconds until the next reminder, and each time the interval ends a desktop notification with the text Time to stretch appears and the countdown starts again. The user presses Stop to end the reminders. The chosen interval is stored on the device and restored after restart.

G4 Meter Log [value derived from the previous record, CSV export]

Meter Log records electricity meter readings. The user adds a reading with a date and a meter value in kilowatt-hours with one decimal, deletes a reading after confirming, and sees the readings newest date first, each with the consumption since the reading before it. The user saves all readings to a CSV file the user chooses. Readings are stored on the device and restored after restart.

G5 Freezer Log [negative choice options, negative decimals, a mark from a comparison]

Freezer Log records freezer temperature checks. The user picks a target temperature of -18, -20, or -24 degrees Celsius and adds a check with a compartment of top, middle, or bottom and a measured temperature in degrees Celsius with one decimal that can be below zero; each check gets the date and time it was added. The user sees the checks newest first, with every check warmer than the target marked as too warm. The target and the checks are stored on the device and restored after restart.

## linux-hyprland-waybar-module

W1 Upload Rate [network-sent source, thresholds 1.50 and 15.00, unit conversion in the tooltip]

Upload Rate shows the network upload rate in megabytes per second with two decimals in a Waybar module, reading it every 3 seconds. The text turns amber above 1.50 and red above 15.00 megabytes per second. The tooltip shows the same rate in kilobytes per second.

W2 Disk Read [disk-read source, click notification]

Disk Read shows how fast the system reads from its disks in megabytes per second with one decimal in a Waybar module, reading it every 2 seconds, and turns amber above 50.0 and red above 200.0. Clicking the module opens a desktop notification with the current rate.

W3 Deadline Days [no system source, a setting, date arithmetic, "below" thresholds]

Deadline Days shows the number of days left until a saved date in a Waybar module, as text like 12 days, refreshed every 60 seconds. The user sets the date with a command. The text turns amber below 7 days and red below 3 days, and shows Past when the date has passed. The tooltip shows the saved date.

W4 Cup Count [click changes a stored count, daily reset]

Cup Count counts the cups of coffee the user drank today in a Waybar module. Clicking the module adds one cup, and the module shows the count as text like 3 cups, turning amber above 3 and red above 5. The count starts again at 0 on a new day. The count is stored on the device.

W5 Euro Rate [network API, four decimals, click opens the browser]

Euro Rate shows how many US dollars one euro buys in a Waybar module with four decimals, using the free Frankfurter exchange rate API, refreshed every 30 minutes. Clicking the module opens the Frankfurter website in the browser. The tooltip shows the date of the rate.

## tauri2-rust-typescript-desktop

T1 Time Sheet [options 0.25, 0.5, 1, 1.5, 2; weekly totals per group]

Time Sheet records work sessions. The user adds a session with a project name, a date, and a length picked from 0.25, 0.5, 1, 1.5, or 2 hours, edits a session, and deletes a session after confirming. The user sees the sessions newest first and the total hours per project for the current week, Monday to Sunday. Sessions are stored on the device and restored after restart.

T2 Tray Tally [tray menu and window share two actions, one stored number]

Tray Tally is a counter. The window shows the count and has an Add one button and a Reset button; the system tray menu has the same two actions and shows the count. Reset asks for confirmation in the window. The count is stored on the device and restored after restart.

T3 Scratch Pad [one record, autosave, file save and file open]

Scratch Pad is a single note. The user types in one text area and the text is saved automatically one second after the user stops typing. The user saves the text to a Markdown file the user chooses, and opens a plain text file the user chooses to replace the text after confirming. The text is stored on the device and restored after restart.

T4 Colour Shelf [input validation, clipboard write, a per-row action, a swatch]

Colour Shelf keeps colours. The user adds a colour with a name and a hex code that must be a hash sign followed by six hexadecimal digits, searches colours by name, clicks Copy on a colour to copy its hex code to the clipboard, and deletes a colour after confirming. Each colour shows a swatch filled with that colour. Colours are stored on the device and restored after restart.

T5 Unit Price [calculator, options 0.5, 1, 1.5, 5, 15, three decimals, a tie rule]

Unit Price compares two offers. For each offer the user enters a price in euros with two decimals and picks a pack size of 0.5, 1, 1.5, 5, or 15 litres; the window shows the price per litre of each offer with three decimals and marks the cheaper offer, or says Same price when they are equal. Nothing is stored.

## astro-web

A1 Peak List [two page types, numeric sort]

Peak List is a website about mountain summits. It has a home page listing every summit highest first with its height in metres, one page per summit with its name, mountain range, height, and year of the first ascent, and one page per mountain range listing the summits of that range highest first.

A2 Lathe Docs [fixed order from a stored number, previous and next links]

Lathe Docs is a documentation website for a command-line tool. It has a home page listing the guides in a fixed order given by a number stored with each guide, and one page per guide with its title and text. Every guide page links to the previous guide and to the next guide in that order; the first guide has no previous link and the last guide has no next link.

A3 Harbor Staff [grouping with two sort rules, an email link]

Harbor Staff is a website for a small company. It has an about page with the company's address, a team page listing the members grouped by department, with the departments in alphabetical order and the members of each department by family name, and one page per member with the name, the role, the department, and an email link.

A4 Print Prices [a table, quantities 100, 1,000 and 10,000, two decimals]

Print Prices is a website for a print shop. It has one prices page with a table of products, each with its price in euros with two decimals for 100, 1,000, and 10,000 copies, and a contact page with the address, the phone number, and the opening hours.

A5 Change Log [sort by date, fixed group order, an empty group is hidden]

Change Log is a website with the release notes of an app. It has a home page listing the releases newest release date first with the version number and the date, and one page per release listing its changes grouped into added, fixed, and removed, in that order; a group with no changes is not shown.

## android-kotlin-compose

N1 Brew Ratio [calculator, options 0.5, 1, 1.5, 2 and 15, 16, 17, nothing stored]

Brew Ratio is a coffee calculator. The user picks the number of cups from 0.5, 1, 1.5, or 2 and a strength of 15, 16, or 17 grams of water per gram of coffee; one cup is 250 grams of water. The screen shows the grams of water and the grams of coffee with one decimal. Nothing is stored.

N2 Sleep Log [time fields, a span across midnight, an average over the last 7 records]

Sleep Log records nights of sleep. The user adds a night with a date, a bedtime, a wake-up time, and a quality from 1 to 5, edits a night, and deletes a night after confirming. The user sees the nights newest first, each with the hours slept with one decimal, counting a wake-up time earlier than the bedtime as the next day, and the screen shows the average hours slept over the last 7 nights recorded. Nights are stored on the device and restored after restart.

N3 Book Loans [a row toggle that is not a delete, a two-state list filter]

Book Loans keeps track of lent books. The user adds a loan with a book title and a borrower's name; the loan gets today's date. The user marks a loan as returned, switches the list between all loans and only loans not returned, and deletes a loan after confirming. Loans are stored on the device and restored after restart.

N4 Winter Log [negative decimal input, minimum and maximum of the current month]

Winter Log records outdoor temperatures. The user adds a reading with a temperature in degrees Celsius with one decimal that can be below zero and an optional note; the reading gets the current date and time. The user deletes a reading after confirming and sees the readings newest first, and the screen shows the lowest and the highest temperature of the current month. Readings are stored on the device and restored after restart.

N5 Tally Board [per-row plus and minus by a stored step, values below zero, two confirmed actions]

Tally Board keeps named counters. The user adds a counter with a name and a step of 1, 5, or 10; each counter shows its value and a plus button and a minus button that change the value by its step, and the value can go below zero. The user resets a counter to 0 after confirming and deletes a counter after confirming. Counters are stored on the device and restored after restart.
