// Local-only browser regression harness: node tests/serve.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const exposed = 'readSegment, collectSegments, transcriptStats, buildText, videoMeta, writeClipboard, flash, scan, ensureTranscriptAndCollect, handleCopyRequest, searchActive';
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const routes = {
    '/watch': 'tests/fixture.html',
    '/tests/fixture.js': 'tests/fixture.js',
    '/content.css': 'content.css',
    '/test-content.js': 'content.js',
  };
  const file = routes[url.pathname];
  if (!file) { res.writeHead(404); res.end(); return; }
  let body = fs.readFileSync(path.join(root, file), 'utf8');
  if (url.pathname === '/test-content.js') {
    body = body.replace(/\}\)\(\);\s*$/, `window.testAPI = {${exposed}};\n})();`);
  }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : 'text/javascript');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}).listen(8765, '127.0.0.1', () => console.log('Regression fixture: http://127.0.0.1:8765/watch?v=fixture'));
