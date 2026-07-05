# EVE Market Browser by RustyBot

A fully-featured EVE Online market browser inspired by evemarketbrowser.com, featuring category navigation, live market data, price history charts, and favorites management.

## Features

- **Category Browser** - Browse items by category (Ships, Modules, Ammunition, Materials, etc.) with an expandable tree sidebar
- **Live Market Data** - Real-time buy and sell orders from ESI
- **Multi-Region Support** - View data from all major trade hubs (Jita, Amarr, Dodixie, Rens, Hek) or individual regions
- **Location Resolution** - Station and structure names resolved automatically
- **Price History Charts** - Interactive charts with 7/30/90/180/365 day views showing high, low, and average prices
- **Search with Suggestions** - Quick search with instant suggestions as you type
- **Favorites** - Save frequently viewed items with localStorage persistence
- **URL Routing** - Shareable links to specific items with region selection
- **Responsive Design** - Works on desktop and mobile devices
- **Dark Theme** - Eye-friendly dark/rusty UI matching the original RustyBot style

## ESI Rate Limits

The application respects ESI rate limits. For heavy usage, consider implementing server-side caching or using a proxy.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)
