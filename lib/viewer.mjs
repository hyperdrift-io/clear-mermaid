import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSource } from './source.mjs';
export { validateSource } from './source.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const TTL = 60 * 60 * 1000;
const MAX_DIAGRAMS = 20;


export async function createViewer() {
  const secret = randomBytes(24).toString('hex');
  const prefix = `/${secret}/`;
  const diagrams = new Map();
  const assets = new Map();
  for (const folder of ['web', 'renderer/dist']) {
    const dir = join(root, folder);
    for (const file of await readdir(dir, { recursive: true, withFileTypes: true })) {
      if (!file.isFile()) continue;
      const path = join(file.parentPath, file.name);
      const relative = path.slice(dir.length + 1).split('\\').join('/');
      const key = folder === 'web' ? relative : `renderer/${relative}`;
      assets.set(key, path);
    }
  }
  let origin;
  const server = createServer(async (req, res) => {
    const finish = (status, body = '') => { res.writeHead(status); res.end(req.method === 'HEAD' ? undefined : body); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (req.headers.host !== new URL(origin).host) return finish(403);
    if (req.headers.origin && req.headers.origin !== origin) return finish(403);
    if (!['GET', 'HEAD'].includes(req.method)) return finish(405);
    let url;
    try { url = new URL(req.url, origin); } catch { return finish(400); }
    if (!url.pathname.startsWith(prefix) || url.search) return finish(404);
    const route = url.pathname.slice(prefix.length);
    let file;
    if (/^diagram\/[a-f0-9]{32}$/.test(route)) {
      const id = route.split('/')[1];
      const record = diagrams.get(id);
      if (!record || record.expiresAt <= Date.now()) { diagrams.delete(id); return finish(404); }
      file = assets.get('index.html');
    } else if (/^source\/[a-f0-9]{32}$/.test(route)) {
      const id = route.split('/')[1];
      const record = diagrams.get(id);
      if (!record || record.expiresAt <= Date.now()) { diagrams.delete(id); return finish(404); }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return finish(200, JSON.stringify(record));
    } else file = assets.get(route);
    if (!file) return finish(404);
    try {
      const mime = file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'text/plain';
      res.setHeader('Content-Type', `${mime}; charset=utf-8`);
      finish(200, await readFile(file));
    } catch { finish(500, 'The local viewer could not load this file.'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    add({ source, title = 'Your diagram' }) {
      const counts = validateSource(source);
      for (const [id, record] of diagrams) if (record.expiresAt <= Date.now()) diagrams.delete(id);
      if (diagrams.size >= MAX_DIAGRAMS) throw new Error('This session holds 20 diagrams. Restart the connector to start a new session; save any source you need first.');
      const id = randomBytes(16).toString('hex');
      const expiresAt = Date.now() + TTL;
      diagrams.set(id, { title, source, expiresAt });
      return { url: `${origin}${prefix}diagram/${id}`, title, ...counts, expiresAt: new Date(expiresAt).toISOString(), validation: 'Preflight passed. Open the link for the browser compatibility check and interactive diagram.' };
    },
    close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }),
  };
}
