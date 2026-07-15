const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const CSV_PATH = path.join(__dirname, 'Rusty_DrawBot.csv');

function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  const y = yyyymmdd.slice(0, 4);
  const m = yyyymmdd.slice(4, 6);
  const d = yyyymmdd.slice(6, 8);
  return `${y}-${m}-${d}`;
}

function parseCsv() {
  try {
    const raw = fs.readFileSync(CSV_PATH, 'utf-8');
    const stat = fs.statSync(CSV_PATH);
    const lines = raw.split('\n').map(l => l.trim());

    let startDate = null;
    let endDate = null;
    let entries = 0;
    let winners = 0;
    let timeouts = 0;

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith('# Start date:')) {
        startDate = formatDate(line.split(':')[1]?.trim());
        continue;
      }
      if (line.startsWith('# End date:')) {
        endDate = formatDate(line.split(':')[1]?.trim());
        continue;
      }
      if (line.startsWith('#')) continue;
      const comma = line.indexOf(',');
      if (comma === -1) continue;
      const name = line.slice(0, comma).trim();
      const count = parseInt(line.slice(comma + 1).trim(), 10) || 0;
      if (name === 'draw_entry') entries = count;
      if (name === 'winner_drawn') winners = count;
      if (name === 'winner_timeout') timeouts = count;
    }

    const avg = entries > 0 && winners > 0 ? +(entries / winners).toFixed(1) : 0;
    const totalDraws = winners + timeouts;
    return { entries, winners, timeouts, totalDraws, avgPerDraw: avg, startDate, endDate, fileModified: stat.mtime.toISOString() };
  } catch (e) {
    console.error('[Analytics] CSV read error:', e.message);
    return { entries: 0, winners: 0, startDate: null, endDate: null, fileModified: null };
  }
}

router.get('/analytics', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json(parseCsv());
});

module.exports = router;
