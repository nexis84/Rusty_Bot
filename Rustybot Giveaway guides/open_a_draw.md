# How to Open a Draw

A step-by-step guide to running a giveaway from start to finish.

![RustyBot main window layout](images/main%20window.png)

---

## Before You Start

- Twitch bot must be **connected** (green status indicator)
- You need at least **one prize** set up in your prize list (see Options → Prizes)
- Participants need to know the **join command** (default: `!draw`)

---

## Step 1: Set a Prize

There are three ways to set what prize is being given away:

### Option A — Type it manually
Type the prize name into the prize input field at the top of the main window, then click **SET**.
```
Example: PLEX
Example: PLEX (CCP)          ← with donator name
Example: PLEX (x3) (CCP)     ← with quantity + donator
```

### Option B — Select from dropdown
Click the dropdown next to the prize input and pick a prize from your configured lists.

### Option C — Use "SET / OPEN" (one-click shortcut)
Click the **SET / OPEN** button after typing or selecting a prize. This sets the prize AND opens the draw in one click.

> **Tip:** You can also use "🎲 RANDOM PRIZE 🎲" from the dropdown to pick a random prize from your lists.

![Prize input field, SET button, and dropdown](images/Prize%20input%20field%2C%20SET%20button%2C%20and%20dropdown.png)

---

## Step 2: Open the Draw

Click the **OPEN DRAW** button.

What happens:
- The button label changes to **CLOSE DRAW**
- Bot announces in Twitch chat: *"GIVEAWAY OPEN! Prize: {prize}. Type '!draw' in chat!"*
- State indicator shows **"COLLECTING"**
- Chat messages matching the join command are now accepted

> **Note:** If you see an error when clicking OPEN DRAW, check that the bot is connected and a prize is set.

![OPEN DRAW button — click to start collecting entries](images/OPEN%20DRAW%20button%20%E2%80%94%20click%20to%20start%20collecting%20entries.png)

---

## Step 3: Collect Entries

While the draw is open, viewers type the join command (`!draw` by default) in Twitch or Kick chat.

- Entries appear in the **participant list** on the right side of the window
- Each entry is tagged with its platform (Twitch = purple, Kick = green)
- Users on **both platforms** can enter if "Allow same user on both Twitch & Kick" is enabled
- Duplicate entries are automatically rejected

![Participant list showing Twitch and Kick entries](images/Participant%20list%20showing%20Twitch%20and%20Kick%20entries.png)

---

## Step 4: Start the Draw

When you're ready to pick a winner:

1. Click **START DRAW**
2. The bot announces in chat: *"Giveaway entries are now CLOSED."*
3. A winner is randomly selected from all participants
4. The **winner reveal animation** plays

> **Note:** You can click **CLOSE DRAW** without picking a winner if you need to cancel. Later, click START DRAW to draw from the same participant pool.

![START DRAW button and state indicator](images/START%20DRAW%20button%20and%20state%20indicator.png)

---

## Step 5: Winner Animation

The animation plays in the main display area. Available animation styles (configurable in Options → Draw Style):

- Hacking (box reveal)
- Triglavian (text morphing)
- Node Path
- Triglavian Conduit
- Code Reveal
- Neon Encrypted
- Neural Decode
- Deep Seek
- Random Tech (picks a random tech-themed style)

If you used **"🎲 RANDOM PRIZE 🎲"** , a **prize reveal animation** plays FIRST to show what the prize is, followed by the winner draw.

> **Multi-Draw mode:** If enabled, multiple winners are selected and shown in one Code Reveal animation.

![Winner reveal animation playing](images/Winner%20reveal%20animation%20playing.png)

---

## Step 6: Winner Confirmation

After the animation, the winner has **90 seconds** to confirm by typing **any message** in chat.

- Bot announces: *"Congrats @{winner}! Type anything in chat within 90s to confirm!"*
- State indicator shows **"AWAITING CONFIRMATION"**
- If the winner confirms in time → proceeds to IGN lookup
- If the timer expires → winner is removed from the list, state shows **"TIMED OUT"**
- Click **START DRAW** again to re-draw from remaining participants

![Confirmation timer showing AWAITING CONFIRMATION state](images/Confirmation%20timer%20showing%20AWAITING%20CONFIRMATION%20state.png)

---

## Step 7: IGN / ESI Lookup

Once confirmed, the bot tries to resolve the winner's EVE character:

1. **Twitch winners:** Bot checks for EVE2Twitch bot response or previously stored IGN
2. **Kick winners:** Bot uses the persistent IGN database or prompts for `!ign`
3. If an IGN is found → ESI data is fetched (portrait, corporation, alliance)
4. The winner's IGN is **automatically copied to your clipboard** so you can paste it wherever needed
5. State shows **"CONFIRMED WITH IGN"** — draw is complete
6. If no IGN can be found → streamer is prompted to ask the winner for their IGN manually

> **Tip:** Winners can pre-register their IGN at any time with `!ign <character name>` in chat.

![Draw complete — CONFIRMED WITH IGN state](images/Draw%20complete%20%E2%80%94%20CONFIRMED%20WITH%20IGN%20state.png)

---

## Step 8: After the Draw

- The winning prize is **automatically removed** from the active prize list (unless it's a common prize)
- The winner's entry is **removed** from the participant pool
- The app returns to **IDLE** state, ready for the next draw
- Repeat from Step 1

---

## Quick Reference

| Button | When to Click | What It Does |
|--------|---------------|--------------|
| **SET** | Before draw | Sets the prize from the input field |
| **OPEN DRAW** / **CLOSE DRAW** | Before/after collecting | Opens or closes entry collection |
| **SET / OPEN** | Before draw | Sets prize AND opens draw in one click |
| **START DRAW** | When entries are collected | Closes entries, selects winner, plays animation |
| **ABANDON DRAW** | During animation/confirmation | Cancels everything, resets to IDLE |
| **PURGE LIST** | After a draw | Clears all remaining participants |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot open draw — no prize set" | Type a prize or select one from the dropdown, then click SET |
| "Bot is not connected" | Wait for the bot to connect, or check Twitch credentials in Options |
| "No participants to draw from" | Make sure viewers are typing the join command (`!draw`) in chat |
| Winner didn't confirm in time | Click START DRAW again to pick a new winner from remaining entries |
| Animation stuck or not showing | Click ABANDON DRAW, then try again. If persistent, restart the app |
| "No IGN found" for winner | Ask the winner to type `!ign <character name>` in chat |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+I` | Import prizes from file (Notepad) |
| `Ctrl+E` | Export prizes to file (Notepad) |
| `Delete` | Remove selected item (Notepad) |
| Hotkeys | Configurable in Options → Hotkeys |
