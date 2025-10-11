# RustyBot Discord Landing Page

This repository contains the landing page for RustyBot Discord, an EVE Online Discord bot, plus an improved `fetchMarketDataTradeHubs` function.

## Landing Page
- Static HTML page at `index.html` showcasing bot features and commands
- Can be hosted on GitHub Pages, Netlify, or any static hosting service
- Set publish directory to `.` (root) for static hosts

## Server Helper (`server.js`)
Contains an improved `fetchMarketDataTradeHubs` function that:
- Uses Discord.js EmbedBuilder for rich formatting
- Fetches market data from EVE Online ESI API
- Handles errors gracefully and shows status for each trade hub
- Sends formatted embeds to Discord channels

### Usage
```javascript
const { fetchMarketDataTradeHubs } = require('./server');
// Call from your bot's command handler:
// fetchMarketDataTradeHubs('Tritanium', 34, message.channel, 10);
```

### Dependencies
```bash
npm install axios bottleneck discord.js
```

## Hosting
- **GitHub Pages**: Enable Pages in repository settings, deploy from `main` branch root
- **Netlify**: Connect repository, set publish directory to `.`
- **Vercel**: Connect repository, build command empty, output directory `.`