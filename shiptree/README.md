# Ship tree

An out-of-game **EVE Online ship tree**: every hull in the game, arranged by
faction lane and hull class, wired to the skills that gate it.

Built from the EVE Static Data Export — not from CCP's ESI or any API, so it
works offline and never rate-limits. 425 hulls (363 in CCP's own tree plus 62
specials), 329 skills, 18 lanes, ≈1.2 MB of JSON split across two files (see
**Data files** below).

```
  ../sde ──▶ build-shiptree.mjs ──▶ data/shiptree.json  (363 KB)
                                                        │          │
                                                        │          └─▶ data/details.json (807 KB, lazy)
                                              index.html + app.js  (static)
```

## What it does

- **Two side panels** — **left = skills**, **right = info**. Click a hull and the
  view does *not* move: the hull is highlighted, the right panel shows its
  details, and the left panel switches to **that hull's own requirements** —
  the skill chain it needs (plus its support skills), indented by lineage, with
  the levels marked. Click a lane header instead and the left panel shows that
  faction's whole skill tree.
- **The skill panel follows your scroll** — whatever faction band sits at the
  middle of the view becomes the focused lane (outlined in gold) and the left
  panel switches to it. An explicit pick (a hull or a lane header) wins until you
  scroll or zoom again.
- **Fixed-width box** — the canvas cannot be dragged left or right: it is always
  centred, and zoom is capped so the full width of a band is always visible. The
  only movement is vertical.
- **Hull stats** — the right panel lists fitting (slots, rigs, CPU/PG,
  hardpoints), navigation (velocity, warp, agility, **align time**, signature,
  scan resolution, **targeting range**), tank (shield / armor / structure /
  capacitor) and hold (cargo, drone bay and bandwidth, mass, volume), straight
  from the SDE's dogma attributes. When your levels are known (EVE sign-in or
  the level chips) each skill-scaled stat shows **base → yours** — CPU/PG after
  CPU Management and Power Grid Management, velocity, agility and align time
  after Navigation / Evasive Maneuvering, shield / armor / structure after the
  tanking skills, and so on — using CCP's own PostPercent skill modifiers.
  Hovering a yellow value names the trained skills behind it (e.g. *CPU
  Management V: +25%*), and align time lists the agility skills that drive it.
- **Omega-only marking** — an `Ω` badge on every hull an Alpha clone cannot
  fly, with the reason in its tooltip. The right panel says **Alpha** or
  **Ω Omega only** and names the blocking requirement (e.g. *"needs Minmatar
  Battleship V, which an Alpha can only train to IV"*), and the header's
  **alpha only** filter hides Omega hulls (178 Alpha / 183 Omega).
- **Estimated market price** — Jita sell/buy (percentile) plus order counts,
  fetched live per hull from Fuzzwork's aggregates API and cached for the
  session; it degrades to "unavailable offline" if the request fails.
- **Skills, not spaghetti** — the skill tree lives in the panel as an indented
  list, not on the canvas. The canvas is hulls only: no plates, no connector
  lines.
- **Hull-class rows** — Frigate, Navy Frigate, Interceptor, Assault Frigate,
  Destroyer … sorted the way the game orders them, packed into lines.
- **Special ships** — a final **Special** lane collects the 62 published hulls
  CCP leaves out of its own in-game ship tree: faction corvettes such as the
  *Immolator* (plus *Echo*, *Hematos*, *Taipan*, *Violator*), tournament/IGC
  prize ships (*Cambion*, *Freki*, *Geri*, *Malice*, *Python*, *Sidewinder*…),
  limited editions (*Gold*/*Silver Magnate*, the Imperial / Federate / State /
  Tribal Issue battleships), the luxury yachts and YC128 campaign buses,
  shuttles, *Zephyr*, *Echelon*, *Primae* and the Genolution capsule. They are
  grouped into synthetic hull-class rows (tagged `special: true` in the data)
  and drop back into a faction lane automatically if CCP ever adds one to its
  own tree.
- **"Can I fly this"** — click a level chip in the left panel (or in the hull
  panel's requirement list) to mark your level 0→V. Hull tiles recolour:
  green = flyable now, amber = one skill short, red = not close. Persisted in
  `localStorage`.
- **Sign in with EVE** — EVE SSO (authorization code + PKCE, no client secret,
  entirely in the browser) reads your real trained levels, so every hull goes
  green/amber/red against your actual character. Level chips become read-only
  while signed in.
  *Your training queue* is also wired up (the queued-skill list, plus a marker on
  the skill you're on right now) but **hidden behind `SHOW_TRAINING_QUEUE = false`**
  in `app.js` — it takes up room in a panel you read to compare hulls, and
  nothing acts on it yet. Flip the flag and the ESI request, the queue block and
  the chip marker all come back. Note the chip only lights when the skill being
  trained is one the open hull actually needs.
- **Mastery levels** — each hull's I–V mastery, resolved from the SDE
  certificates. The panel shows how many grades you have met and which skills
  stand between you and the next one. The header's **not mastery V** filter keeps
  only the hulls you have not yet brought to grade V; it stays disabled until
  skill levels are known *and* the lazy mastery data has loaded.
- **Tabbed hull panel** — the right panel splits into **overview** (tier/Alpha
  chips, hull description, mastery, Jita price, CCP base price), **stats**
  (fitting, navigation, tank, hold), **bonuses** (role bonuses, plus hull bonuses
  grouped by the skill each one scales with per level), **plan** (a trainable
  skill plan — see below) and **compare**. The hull's picture and name sit in the
  panel header above the tabs, and its zKill / market / blueprint links sit in a
  footer below them, so both stay put while you switch panes. All five panes are
  built once and the tabs just switch between them, so it's instant and never
  re-fetches the price. Your tab choice is remembered across hulls and reloads.
- **Skill plan, exportable to the game** — the **plan** tab turns a hull into an
  ordered training plan. Pick a target: **fly it** (the minimum prerequisites) or
  **Mastery I–V**. The builder closes over prerequisites (a skill can't be trained
  before its own requirements), then topologically sorts the steps so
  prerequisites come first — cheap roots early — and costs each one in **SP and
  time** from your training attributes. With your levels known it drops the steps
  you have already trained and shows only the gap. **copy for EVE** puts the plan
  on the clipboard as one `Skill Name Level` per line for the client's *Import
  Skill Plan from Clipboard*; **.txt** downloads it and **share** copies a
  `?ship=…&plan=…` deep link. A plan over 150 skills is longer than the training
  queue, and the clipboard is text only — EVE keeps skill plans client-side, so
  there is no API to write one.
- **Hull descriptions** — the SDE's flavour text for all 425 hulls, paragraphed and
  clamped with a more/less toggle. CCP's markup only ever contains `<i>`, `<a
  href=showinfo:…>` and `<br>`, so the builder unwraps the anchors to plain text
  and the front end escapes again, re-allowing only `<i>`/`<br>`.
- **Compare up to four hulls** — the `⇆` button in the panel header pins the
  open hull; each hull you click adds a column (up to four). Stats are shown as
  `label | A | B | …` with the best value highlighted — *lower* wins for mass,
  signature radius, agility and the CPU budget. Each hull's unique skills and
  the skills shared by all are listed below. Compare state is shareable via
  `?compare=…`.
- **Search reaches past names** — hull class (`interceptor`), every tag
  (`armor`, `missiles`, `drones`, `ECM`…), faction (`Amarr`), tier (`T2`), type
  ID (`97793`), aliases (`HAC`, `AF`, `dictor`…) and **bonus text**
  (`doomsday`). Hits are grouped and each says why it matched; picking a bonus
  hit opens that hull on the Bonuses tab with the matching line flashed. A
  fuzzy fallback catches typos (`herlad`), and “show all” removes the 25-hit
  cap. Bonus search needs the lazy data, so it degrades to the fast fields
  until that lands rather than failing.
- **Training times** — SP = `250 × rank × 4^(level−1)`, SP/min = the skill's
  own `primary + secondary/2` using the five attributes in the Attributes
  popover (or your EVE character's real attributes after SSO), so every
  prerequisite shows `SP · time` and the whole queue is totalled.
- **Search** — `/` focuses, arrows walk the hits, Enter jumps to the hull or
  opens the skill's lane in the panel. Searches names, classes, every hull tag,
  faction, tier, type ID and aliases. Deep links: `?ship=587`, `?skills=500010`,
  `?skill=3329`, `?rows=combat`, `?q=Herald`, `?compare=587,588`, `?plan=fly|5`,
  `?lanes=500003`, `?att=17,17,17,17,17`.
- **Faction key** — the header *key* button opens a grid of faction emblems
  (faction colour + initials, since CCP's image server exposes no faction
  textures). Click one to jump straight to that lane; the band flashes and
  hidden lanes are shown again automatically.
- **Overview map** — the canvas is ~10,000 px tall, so a minimap in the corner
  shows every faction band with a viewport rectangle you can click or drag.
- **Tiles** — tier is the colour stripe down the left edge (blue T1, green T2,
  gold Faction, purple T3), hull names wrap onto two lines rather than being
  truncated, and every icon sits on the same plate.
- **Keyboard & screen readers** — hull tiles form a roving-tabindex grid: Tab
  enters, arrows move (up/down pick the nearest tile above/below), Enter/Space
  opens, Home/End jump to the ends. Search is a proper `combobox`/`listbox`,
  level chips and lane toggles are focusable, and `prefers-reduced-motion` is
  honoured in both CSS and the JS width tween / smooth scrolls.
- **Phones** — below 900px the skills and hull panels become slide-over drawers
  (tap the backdrop to close) and the header wraps; the canvas supports
  two-finger pinch-zoom alongside drag-to-pan. A hard data failure shows a
  centred error card instead of a whisper in the status bar.
- **Market links to your own site** — `rustybot.co.uk/market/?type=<id>&region=10000002`
  (Jita), alongside zKillboard and the Eve University wiki.
- Lane headers show a lane's skill tree; the small `−` in a header collapses it;
  filters split all / combat / industry.

## Data notes

**Alpha / Omega** is derived, not stored: the SDE has no clone-state flag, so
`build-shiptree.mjs` carries CCP's Alpha skill caps (from the EVE University
"Clone states" table) and marks a hull Omega-only when any prerequisite exceeds
its cap. That reproduces CCP's own rule — Alphas fly up to battleship size plus
basic haulers, including Navy/Faction hulls — and it explains itself per hull.
Note it is the game's mechanical rule: CONCORD hulls like the *Pacifier* come out
Alpha-flyable because the SDE only asks for T1 frigate skills at level 1.

Ships come from the SDE's category *Ship* (`published`), which keeps abyss
filaments, mutaplasmids and Upwell cores out. A hull CCP places in its own tree
(`shipTreeGroupID`) is routed to its faction lane and positioned by its most
specific **hull** prerequisite — support skills (Gunnery, Mechanics, Drones…)
are carried as requirements but never position a hull. A published hull with no
`shipTreeGroupID` (shipped with `special: true`) is instead grouped into the
synthetic **Special** lane, with a hull-class row named after its inventory
group. Officer/Abyssal variants are not separate hull types and are not shown.

## Branding

The page follows the rest of rustybot.co.uk: the `Home / Ship Tree` breadcrumb,
the RustyBot logo, `RustyShip Tree` in the header, the `#e8d900` accent,
`Segoe UI`, and the same dark palette (`#121212` / `#1e1e1e` / `#2a2a2a`,
borders `#333`/`#444`). Title, meta description, favicon and a canonical of
`https://www.rustybot.co.uk/shiptree/` are set in `index.html`.

## Data files

The builder writes **two** files:

| file | size | when |
|---|---|---|
| `data/shiptree.json` | ~361 KB | blocks first paint — everything the tree needs |
| `data/details.json` | ~804 KB | fetched *after* first paint; read once a hull is open |

Raw sizes are misleading here: gzipped they are **46 KB** and **116 KB**. Check
with `node -e "…gzipSync(require('fs').readFileSync(f)).length…"` before worrying
about a number above.

`skills[]` carries the ship-gating skills plus their full prerequisite closure,
and — since a training plan has to name and cost every step — the mastery
certificates' support skills as well (weapons, tanking, drones), which gate no
hull. That is why the list is 329 skills rather than the ~137 a hull-only closure
would need.

`details.json` holds the four things nothing on screen needs until you actually
open a hull: the deduped **mastery profiles** (I–V), the deduped **ship bonuses**,
the hull **descriptions**, and the passive **skill modifiers** (skill → hull stat).
The canvas uses none of them, so they stay off the critical path. Descriptions are
the biggest single item (~59 KB gzipped) and are the only reason the file grew
past 500 KB.

Bonus sets are deduped as two separate tables (194 role-bonus sets, 385
hull-bonus sets) rather than one combined profile per hull — deduping the pair
collapses to nearly one entry per hull, i.e. no dedup at all, because the
hull-bonus half is near-unique per ship.

Hulls reference both tables **by position**, which means a stale `details.json`
sitting next to a fresh `shiptree.json` would show the *wrong* mastery levels and
the *wrong* bonuses rather than none — so both files carry a `detailsHash` and
the front end re-fetches with a cache-buster if they disagree.

Neither file is content-hashed, so `Rusty_Bot-main/render.yaml` serves them
`max-age=0, s-maxage=0, must-revalidate` rather than `immutable`: every load
revalidates with the ETag, so a refreshed SDE reaches returning visitors on the
first reload instead of sitting behind a five-minute edge cache.

## Ship bonuses

`typeBonus.jsonl` is keyed by the **hull's own typeID** and covers all 425 hulls.
Each row has two distinct arrays, and the right panel's **Bonuses** tab shows
both:

- **`roleBonuses`** — what the hull contributes on its own. Note this is *not*
  reliably "no skill needed": the Ibis keeps its Caldari Frigate turret, missile
  and ECM bonuses in here, so the headings deliberately don't editorialise.
- **`types[]._value`** — the hull's own bonuses, each group keyed by the **skill
  the value scales with per level**. Verified against the data: frigates map to
  the racial frigate skill, Assault Frigates to `Assault Frigates`, Interceptors
  to `Interceptors`, and a Blackbird to its own `Minmatar Titan` prerequisite.

CCP stores the bonus text as CCP-flavoured HTML (`<a href=showinfo:NNN>`), which
the builder flattens to plain text. `dogmaUnits` resolves the symbol: `%`, `+`,
`x`, `m`. 386 of the 2,334 lines carry no number at all (*"Can fit a Doomsday
module"*), so the value is optional and never assumed.

## Skill modifiers

The stats tab's **base → yours** figures come from CCP's own skill effects, not a
hand-written table. `build-shiptree.mjs` walks `dogmaEffects.jsonl` for modifiers
that target a *ship* attribute (`domain: "shipID"`), are a PostPercent
(`operation: 6`), and land on a stat the UI shows. The per-level value is the
skill's own "bonus" attribute — CPU Management carries `cpuOutputBonus2 = 5`, so
each level is +5% CPU. That yields 12 modifiers today (CPU/PG, velocity, agility,
shield/armor/structure, capacitor and its recharge, scan resolution, targeting
range, and the two agility skills). The front end applies each multiplicatively
by your level, exactly as the client stacks them, and only for stats you have
trained. Count-style modifiers (e.g. a turret slot) are deliberately excluded.

## Skill plan

The **plan** tab (see *What it does*) builds a trainable, ordered plan for the
open hull. Two targets:

- **fly it** — the hull's prerequisites and their closure.
- **Mastery I–V** — the mastery certificate's skills and their closure.

Steps are ordered so prerequisites precede dependents (Kahn over the prerequisite
edges, ties broken by depth then rank, so cheap roots finish early). Each step is
costed with the same maths as the rest of the page — `SP = 250 × rank ×
4^(level−1)`, `SP/min = primary + secondary/2` — and, when your levels are known,
steps you have already trained are dropped.

**Export:** *copy for EVE* writes one `Skill Name Level` per line to the
clipboard; in the client open **Character Sheet → Skill Plans → Import** and
paste. *.txt* downloads the same, and *share* copies a `?ship=…&plan=…` link.
Two limits worth knowing: the client keeps skill plans locally (there is no ESI
endpoint to write one), and a plan longer than **150** entries exceeds the
training queue.

## Run it

This folder is the single source copy. It lives inside `Rusty_Bot-main` and is
served by the main static site at `/shiptree/`.

```powershell
cd "C:\Users\nexis\Desktop\Rustybot services\Rusty_Bot-main\shiptree"
node build-shiptree.mjs          # SDE -> data/*.json (+ sanity report)
node build-ship-pages.mjs        # data -> ship/<id>-<slug>/ + sitemap block
node audit-skills.mjs            # cross-check every hull against CCP's own ship tree
python -m http.server 8777       # then open http://127.0.0.1:8777/
```

Add `?debug` to the URL to log render timings and the data parse time to the
console.

Serve it over HTTP — `fetch('data/shiptree.json')` does not work from `file://`.
Ship icons are pulled from CCP's public image server
(`images.evetech.net/types/<id>/icon?size=64`).

## Refresh the data

The builder reads the same local SDE the rest of the tooling uses, so the usual
refresh keeps it current:

```powershell
cd "C:\Users\nexis\Desktop\Rustybot services"
.\refresh-sde.ps1
```

That runs the SDE tracker, every site generator, and this builder, writing
directly into `Rusty_Bot-main\shiptree\data`. To rebuild only the tree:

```powershell
cd "C:\Users\nexis\Desktop\Rustybot services\Rusty_Bot-main"
node shiptree/build-shiptree.mjs
node shiptree/build-ship-pages.mjs
node shiptree/audit-skills.mjs
```

## Deploy

The ship tree is part of `Rusty_Bot-main`. Commit and push that repo as usual;
the main Render static site serves `Rusty_Bot-main/shiptree/` at
`https://www.rustybot.co.uk/shiptree/`.

## Files

| file | what |
|---|---|
| `build-shiptree.mjs` | SDE jsonl → `data/shiptree.json` + `details.json`, prints a sanity report |
| `build-ship-pages.mjs` | generates `ship/<id>-<slug>/` pages + `ship/index.html` + sitemap block |
| `audit-skills.mjs` | cross-checks every hull's requirements against CCP's own ship tree |
| `config.json` | `sdeDir` (defaults to `../sde`), output paths, official SDE URLs |
| `index.html` | shell: header, stage, panel, status bar |
| `welcome.js` | first-run / help overlay |
| `style.css` | Rusty HUD styling (dark, gold accent, cut-corner panels) |
| `app.js` | layout engine, pan/zoom, search, flyability checker, panel, skill plan |
| `esi.js` | EVE SSO (PKCE) — pulls your real trained skills and queue |
| `sso-callback.html` | redirect target that swaps the SSO code for tokens |
| `data/shiptree.json` | generated data — commit this |
| `data/details.json` | generated data — commit this |
| `data/version.json` | build id for cache-busting data URLs — commit this |
| `img/factions/` | optional real faction emblems (see its own README) |
| `manifest.json` | PWA manifest |
| `sw.js` | service worker: offline shell, network-first data |
| `icon-192.png`, `icon-512.png` | PWA icons |
| `tests/smoke.mjs` | Playwright smoke tests (`npm install && npm test`) |
| `package.json` | test-only dev dependency (`playwright-core`) |
| `README.md` | this file |

## Recent additions (2026-10-31)

- **Search 2.0** — searches every hull tag (Armor, Shields, Missiles, Drones,
  Energy Turrets, ECM…), faction/lane, tier, type ID and common aliases
  (`HAC`, `AF`, `EAF`, `SB`, `dictor`, `HIC`, `CS`, `T3C`), with fuzzy fallback
  for typos and a “show all” option instead of a silent 25-hit cap.
- **Compare up to four hulls** — per-column remove, shared/unique skill lists,
  and a shareable `?compare=…` link.
- **Deep links** — `?q=` restores a search, `?lanes=` now actually applies lane
  visibility, and every hull has a copy-link button.
- **Planning** — five real attributes with per-skill SP/min, ESI attribute
  sync, +3/+4/+5 presets, saved plans, clipboard plan import, and hull +
  skillbook cost.
- **Discovery** — similar-hull chips, random hull, next-unlock shortcut.
- **PWA** — installable, offline shell, and network-first data so a new SDE
  build cannot hide behind the service worker.
- **Mobile** — filter chips collapse into a bottom sheet.
- **Data freshness** — `/shiptree/data/*` now revalidates every load; the
  footer shows the SDE build and generated date.
- **Per-ship pages** — every hull has a static, indexable page at
  `ship/<typeID>-<slug>/` with stats, bonuses, skills, mastery, description,
  live Jita price and links into the tree. `ship/index.html` lists all hulls,
  and `build-ship-pages.mjs` keeps the pages and sitemap block in sync.
