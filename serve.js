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
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const SAFE_EXTENSIONS = new Set(Object.keys(mime));

// Files/dirs that must never be served (secrets, state, keys, source, etc.)
const SENSITIVE_SEGMENTS = new Set([
  '.env', '.env.local', '.env.development.local',
  'deploy_state.json', 'snapshot.json', 'config.json',
  'package-lock.json', 'package.json',
  'deploy.tar.gz', 'deploy_oracle.ps1', 'deploy_to_oracle.ps1', 'update_oracle.ps1',
  'keys', 'node_modules', 'sde', 'SDE', '__pycache__',
  'serve.js', 'serve.py', 'server.js'
]);
const SENSITIVE_EXTENSIONS = new Set(['.key', '.pem', '.crt', '.p12', '.pfx', '.log']);

function isSensitive(relPath) {
  const parts = relPath.split(/[\\/]+/).filter(Boolean);
  for (const part of parts) {
    if (SENSITIVE_SEGMENTS.has(part)) return true;
    if (part.startsWith('.')) return true; // dotfiles (except served from an allowlist below)
  }
  const ext = path.extname(relPath).toLowerCase();
  if (SENSITIVE_EXTENSIONS.has(ext)) return true;
  return false;
}

http.createServer((req, res) => {
  let decoded;
  try {
    decoded = decodeURIComponent(req.url.split('?')[0]);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad request');
    return;
  }

  let p = decoded;
  if (p === '/' || p === '') p = '/index.html';

  const full = path.normalize(path.join(root, p));

  // Proper path-boundary check: the resolved path must stay inside root.
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Deny serving sensitive files regardless of extension allowlist.
  if (isSensitive(rel)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  let stat;
  try {
    stat = fs.statSync(full);
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
    return;
  }

  if (stat.isDirectory()) {
    const idx = path.join(full, 'index.html');
    if (fs.existsSync(idx) && !isSensitive(path.relative(root, idx))) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      fs.createReadStream(idx).pipe(res);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
    return;
  }

  // Only serve known safe extensions.
  const ext = path.extname(full).toLowerCase();
  if (!SAFE_EXTENSIONS.has(ext)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(full).pipe(res);
}).listen(8765, '127.0.0.1', () => console.log('Serving RustyBot on http://localhost:8765'));
