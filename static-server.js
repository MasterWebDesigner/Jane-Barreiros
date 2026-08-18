const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || '.';
const PORT = parseInt(process.argv[3] || '8001', 10);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.ogg': 'audio/ogg',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, `http://localhost:${PORT}`).pathname);
  } catch {
    res.writeHead(400); res.end('Bad Request'); return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  /* Endpoint interno: ocultar/exibir uma publicação do Instagram */
  if (req.method === 'POST' && urlPath === '/api/hide-instagram') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      try {
        var payload = JSON.parse(body || '{}');
        var ordem = Number(payload.ordem);
        var ocultar = !!payload.ocultar;
        var tag = payload.tag;
        var dataFile = path.join(ROOT, 'content', 'site.json');
        var data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        var posts = (data.instagram && data.instagram.posts) || [];
        var found = posts.find(function (p) { return p.ordem === ordem; });
        if (!found) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, error: 'post ' + ordem + ' nao encontrado' }));
          return;
        }
        found.ocultar = ocultar;
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true, ordem: ordem, ocultar: found.ocultar, tag: tag, arquivo: 'content/site.json' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
      }
    });
    return;
  }

  let filePath = path.join(ROOT, urlPath);
  const resolved = path.resolve(filePath);

  // Previne acesso fora do diretório raiz
  if (!resolved.startsWith(path.resolve(ROOT))) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    fs.readFile(filePath, (err2, data) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 - Arquivo não encontrado: ' + urlPath);
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});