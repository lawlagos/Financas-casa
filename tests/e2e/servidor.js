// Servidor estático do app para os testes de ponta a ponta. `trocas` substitui arquivos (ex.: config.js).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

const RAIZ = new URL('../../app/', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export async function servirApp(trocas = {}) {
  const server = createServer(async (req, res) => {
    // Como o GitHub Pages: pasta serve o index.html dela (o app Pudins fica em pudim/).
    let caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^\/+/, '');
    if (!caminho || caminho.endsWith('/')) caminho += 'index.html';
    try {
      const corpo = trocas[caminho] ?? (await readFile(join(RAIZ, caminho)));
      res.writeHead(200, { 'Content-Type': TIPOS[extname(caminho)] || 'application/octet-stream' });
      res.end(corpo);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, r));
  return { server, base: `http://localhost:${server.address().port}` };
}
