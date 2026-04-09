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

## Usage

1. Open `index.html` in a modern web browser
2. Browse categories in the sidebar or use the search box
3. Click an item to view market data
4. Use the region selector to switch between trade hubs
5. Add items to favorites by clicking the star icon

## File Structure

```
market/
├── index.html      # Main HTML structure
├── style.css      # Complete stylesheet with dark theme
├── app.js         # Main application logic
├── categories.js  # Category tree and item data
└── README.md      # This file
```

## Technical Details

- **Pure client-side** - Uses EVE ESI (EVE Swagger Interface) public endpoints
- **No server required** - Can be hosted on any static file server
- **LocalStorage** - Favorites persist in browser storage
- **Chart.js** - For price history visualization
- **Font Awesome** - For icons

## ESI Rate Limits

The application respects ESI rate limits. For heavy usage, consider implementing server-side caching or using a proxy.

## Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)
