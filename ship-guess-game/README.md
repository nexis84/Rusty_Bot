Ship Guess Game (Classified Hulls)

This is a standalone copy of the "Ship Guess Game" integrated into the Rusty Bot site.

How to run locally:

- Option A (quick): Open `index.html` in your browser (may be blocked by fetch() in some browsers due to CORS/file:// restrictions).
- Option B (recommended): Serve the directory with a simple static server and open `http://localhost:8000`:
  - Python 3: `python -m http.server 8000` (run from `ship-guess-game` folder)
  - Then open `http://localhost:8000` in your browser.

Notes:
- The game fetches `./data/ships.json`. The full dataset is included in `data/ships.json`.
- If you move files, ensure `index.html`, `app.js`, and `data/ships.json` remain together.

If you want, I can also add a short credits section or tweak the UI styling to match the rest of your site.