// Static file server for the tests: serves the repository root the way GitHub Pages does.
//   node tests/serve.js [port]        run on its own (used by playwright.config.js)
//   require('./serve').start(port)    start one inside a test (the offline test stops it mid-test)
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.css': 'text/css',
};

function handler(req, res) {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.join(ROOT, url);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

function start(port = 0) {
  return new Promise(resolve => {
    const server = http.createServer(handler).listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.PORT || 4173);
  start(port).then(() => console.log(`serving ${ROOT} on http://127.0.0.1:${port}`));
}

module.exports = { start, ROOT };
