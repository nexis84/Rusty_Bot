# RustyBot Market Check (static)

Client-side market lookup that queries EVE ESI endpoints to provide quick price/volume checks.

Usage
- Open [websites/market/index.html](websites/market/index.html) in a browser.
- Enter an item name and choose a region, then click "Search".

Notes
- This is a lightweight, client-side tool that uses ESI public endpoints. No server required.
- ESI rate limits apply; heavy usage should be proxied through a backend.

Next steps (optional)
- Add server-side caching and type-name lookup fallback for fuzzy matches.
- Resolve location_id to human-readable station/system names via ESI.
