# EVE Market Browser by RustyBot

A fully-featured EVE Online market browser inspired by evemarketbrowser.com, featuring category navigation, live market data, price history charts, and favorites management.

## Features

- **Category Browser** - Browse items by category (Ships, Modules, Ammunition, Materials, etc.) with an expandable tree sidebar
- **Live Market Data** - Real-time buy and sell orders from ESI
- **Ship Tree Links** - Open any ship directly in the interactive RustyBot Ship Tree
- **Multi-Region Support** - View data from all major trade hubs (Jita, Amarr, Dodixie, Rens, Hek) or individual regions
- **Location Resolution** - Station and structure names resolved automatically
- **Price History Charts** - Interactive charts with 7/30/90/180/365 day views showing high, low, and average prices
- **Search with Suggestions** - Quick search with instant suggestions as you type
- **Favorites** - Save frequently viewed items with localStorage persistence
- **URL Routing** - Shareable links to specific items with region selection
- **Responsive Design** - Works on desktop and mobile devices
- **Dark Theme** - Eye-friendly dark/rusty UI matching the original RustyBot style

## SKIN Icons

The market ships local icons for every SKIN in the SDE. `skin-icons.js` maps
each skin typeID to a content-addressed PNG in `skin-icons/`; many skins share
the same 64x64 theme icon, so the pack is deduplicated to a few hundred files.

To rebuild the icons from a new `SKIN Icons.zip` (which must contain
`skins.csv` plus the PNGs):

```powershell
cd "C:\Users\nexis\Desktop\Rustybot services\Rusty_Bot-main"
python scripts/build-skin-icons.py "C:\Users\nexis\Desktop\SKIN Icons.zip"
```

The script adds/updates `market/skin-icons.js` and `market/skin-icons/`, removes
stale icons, and prints coverage. Newly added skins missing from the pack fall
back to the palette icon automatically. If you rebuild the pack, bump
`skin-icons.js?v=` in `market/index.html` so browsers pick up the new map.

Ship → skin membership is generated separately from the SDE by
`scripts/build-skin-ships.mjs` (run automatically by `refresh-sde.ps1`). It
writes `market/skin-ships.js`, which powers the **SKINs** tab on ship pages.

## ESI Rate Limits

The application respects ESI rate limits. For heavy usage, consider implementing server-side caching or using a proxy.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)
