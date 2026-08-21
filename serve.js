const http = require('http');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const mime = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const full = path.join(root, p);
  if (!full.startsWith(root) || !fs.existsSync(full)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
    return;
  }
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    const idx = path.join(full, 'index.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(idx).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'Content-Type': mime[path.extname(full)] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(8765, () => console.log('Serving RustyBot on http://localhost:8765'));