# Hacking Practice — Build Plan

A RustyBot training tool that recreates the **EVE Online data/relic site hacking
minigame** (as seen in the itch.io "EVE Hacking Practice" tool) in our own style.

> Status: planned. This is a standalone training tool for the in-game activity —
> unrelated to the site's other games.

## Findings / Context

- The itch.io game is a practice tool for EVE Online's data & relic site hacking
  minigame: a hex grid where you thread a virus to the System Core, fight
  defensive nodes and collect utilities.
- The site's existing `sleeper-archive/` is carded as "EVE Hacking Minigame" but
  is actually a word / hangman game. It is unrelated; this tool stands alone and
  that folder is left untouched.
- Established React/Vite pattern (`SleeperArchive/` source -> `sleeper-archive/`
  committed build; `vite.config.ts` sets `base` + `outDir`) is the template.
- Deploy is via root `deploy_all.ps1` (git pushes `Rusty_Bot-main`). No backend
  needed — leaderboard is out of scope.

## 1. Project Structure (mirrors SleeperArchive)

```
Rusty_Bot-main/
  HackingPractice/            # React + Vite + TS source
    index.html                # shell + RustyBot topbar / breadcrumb
    package.json, tsconfig.json, vite.config.ts
                              # base: '/hacking-practice/', outDir: '../hacking-practice'
    src/
      main.tsx, index.css
      game/ hex.ts, types.ts, generate.ts, engine.ts, difficulties.ts
      components/ Menu, HexBoard, HexNode, VirusPanel, UtilityBelt,
                  EventLog, HowTo, GameOver, StatsPanel, Toast
      hooks/useGame.ts
      audio.ts, storage.ts
  hacking-practice/           # built output (served at /hacking-practice/)
```

Dependencies (match SleeperArchive, minus express/Gemini): `react`, `react-dom`,
`vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`,
`lucide-react`, `motion`.

## 2. Game Mechanics (faithful)

- **Hex board** (6 neighbours), irregular edges, sizes by difficulty; start node
  and System Core placed >= 8 steps apart.
- **Node reveal**: unexplored -> adjacent (selectable) -> explored empty showing
  a distance number 1-5.
- **Virus stats**: Coherence + Strength derived from a "fit" selector
  (Analyzer T1/T2, Hacking/Archaeology skill) so the tool is educational.
- **Defensives**: Firewall, Anti-Virus, Virus Suppressor (halves your strength),
  Restoration Node (buffs exposed defences each turn) — turn-based retaliation
  combat.
- **Utilities** (belt slots, keys 1-4): Self Repair, Kernel Rot (-50% target),
  Polymorphic Shield (block next 2 attacks), Secondary Vector (20 dmg/turn x3).
- **Data Cache**: 50/50 reveals a defensive or utility subsystem.
- **Win** = core coherence 0; **lose** = your coherence 0.
- **Difficulty presets**: High-Sec / Low-Sec / Null-Sec / Wormhole with authentic
  tier stats.

## 3. Polish

Difficulty / virus-fit menu, how-to-play drawer, utility hotkeys, event log, run
stats (turns, nodes revealed, damage dealt/taken, efficiency) + lifetime stats in
localStorage, local achievements, sound toggle (WebAudio synth, no asset files),
coach tips after a loss, keyboard + mobile responsive, optional "Save PNG"
summary (html2canvas).

## 4. Integration

- Add a card in the hub **Tools** section (not Games — it is a training tool)
  pointing at `hacking-practice/`.
- Add `<loc>https://www.rustybot.co.uk/hacking-practice/</loc>` to `sitemap.xml`.
- Leave `sleeper-archive/` untouched.

## 5. Build & Verify

- `npm install && npm run build` in `HackingPractice/` -> emits into
  `hacking-practice/`.
- Verify with `npm run lint` (`tsc --noEmit`), plus quick engine unit checks for
  combat / resolution.
- Commit only when explicitly asked.

## Decisions To Confirm

1. **Theme**: RustyBot dark + yellow (`#121212` / `#e8d900`, Titillium Web, like
   top-trumps) — or SleeperArchive's orange/cyan terminal look?
   Recommendation: RustyBot yellow for brand consistency, using authentic EVE
   node colours on the board.
2. **Folders**: two folders (`HackingPractice/` source + `hacking-practice/`
   build) matching SleeperArchive — or everything in a single
   `hacking-practice/` folder?
3. Include the optional **PNG share summary**? (adds an html2canvas dependency)
