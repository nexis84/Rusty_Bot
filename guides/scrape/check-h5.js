const fs = require('fs');
const surv = JSON.parse(fs.readFileSync('./data/anomic-missions-survival.json', 'utf8'));
Object.keys(surv).forEach(function(k) {
  const d = surv[k];
  const pockets = d.pockets || [];
  const h5s = pockets.filter(function(p) { return p.level === 'h5'; });
  if (h5s.length) {
    console.log(k + ' (' + d.name + '):');
    h5s.forEach(function(p) {
      const lines = p.lines ? p.lines.slice(0, 3).join(' | ') : '';
      console.log('  h5 "' + p.heading + '": ' + lines);
    });
  } else {
    console.log(k + ' (' + d.name + '): no h5 pockets');
  }
});
