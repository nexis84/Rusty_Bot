// DEPRECATED — do not use.
//
// This used to walk ESI's /universe/categories -> groups -> types routes to
// scrape skill data in the browser console. Those static /universe routes
// were removed with ESI compatibility date 2026-11-19, and the SDE API's
// groups records carry no per-group type list, so the walk is no longer
// possible (and fetching the full 150 MB types table in a browser was never
// sensible).
//
// Use one of these instead:
//   - node fetch-all-skills.js   — same output (all-skills.json/.txt), built
//                                   from the local SDE files
//   - scripts/generate_skillplanner_data.py — the pipeline generator that
//                                   produces the skillplanner's site data
//                                   (run by refresh-sde.ps1)

console.warn('[fetch-skills] This script is deprecated and no longer works.');
console.warn('[fetch-skills] Run "node fetch-all-skills.js" or the refresh-sde.ps1 pipeline instead.');
