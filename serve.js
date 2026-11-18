// Servidor estático mínimo para desarrollo: `node serve.js` → http://localhost:5173
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const PUERTO = Number(process.env.PORT) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const archivo = path.normalize(path.join(RAIZ, ruta === '/' ? 'index.html' : ruta));
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(datos);
  });
}).listen(PUERTO, () => console.log(`Neón Studio en http://localhost:${PUERTO}`));
