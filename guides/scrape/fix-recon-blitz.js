const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/missions.json', 'utf8'));

const fixes = {
  Recon2an: "Use frigate or interceptor to MWD to gate, take gate to next room, then warp out.",
  Recon2br: "Use frigate or interceptor to MWD to gate, take gate to next room, then warp out.",
  // Recon2gu already has blitz info
  Recon2sa: "Use frigate or interceptor to MWD to gate, take gate to next room, then warp out.",
  Recon2se: "Use frigate or interceptor to MWD to gate, take gate to next room, then warp out.",
  Recon2: "Use frigate or interceptor to MWD toward gate. Around 10km from gate, enemies will spawn. Immediately warp out.",
};

let c = 0;
for (const [k, v] of Object.entries(fixes)) {
  const m = data[k];
  if (m) {
    if (!m.info) m.info = {};
    m.info.Blitz = v;
    c++;
  }
}

fs.writeFileSync('data/missions.json', JSON.stringify(data, null, 2));
console.log('Added Blitz to', c, 'Level 2 Recon entries');
