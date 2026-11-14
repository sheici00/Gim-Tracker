// Servidor de Gym Tracker: sirve la app (dist/) y la API de cuentas y sincronización.
// Sin dependencias: usa los módulos nativos de Node (http, sqlite, crypto). Requiere Node 22.13+.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = resolve(process.env.DATA_DIR ?? join(ROOT, 'data'));
const MAX_BODY = 5 * 1024 * 1024;

mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(join(DATA_DIR, 'gym-tracker.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL, hash TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS tokens (
    hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS states (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    rev INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
`);

const sha = (s) => createHash('sha256').update(s).digest('hex');
const hashPassword = (password, salt) => scryptSync(password, salt, 64).toString('hex');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- Límite de intentos de acceso por IP ---------- */
const attempts = new Map();
function throttle(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 15) throw new HttpError(429, 'Demasiados intentos. Probá de nuevo en unos minutos.');
  list.push(now);
  attempts.set(ip, list);
}

/* ---------- Cuentas ---------- */
function issueToken(userId) {
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO tokens (hash, user_id, created_at) VALUES (?, ?, ?)').run(sha(token), userId, Date.now());
  return token;
}

function credentials(body) {
  const username = String(body?.username ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  if (!/^[a-z0-9._@+-]{3,64}$/.test(username)) throw new HttpError(400, 'El usuario debe tener entre 3 y 64 caracteres (letras, números, . _ - @).');
  if (password.length < 8 || password.length > 200) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres.');
  return { username, password };
}

function register(body) {
  const { username, password } = credentials(body);
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Ese usuario ya existe.');
  const salt = randomBytes(16).toString('hex');
  const { lastInsertRowid } = db.prepare('INSERT INTO users (username, salt, hash, created_at) VALUES (?, ?, ?, ?)')
    .run(username, salt, hashPassword(password, salt), Date.now());
  return { username, token: issueToken(Number(lastInsertRowid)) };
}

function login(body) {
  const { username, password } = credentials(body);
  const user = db.prepare('SELECT id, salt, hash FROM users WHERE username = ?').get(username);
  const ok = user && timingSafeEqual(Buffer.from(hashPassword(password, user.salt), 'hex'), Buffer.from(user.hash, 'hex'));
  if (!ok) throw new HttpError(401, 'Usuario o contraseña incorrectos.');
  return { username, token: issueToken(user.id) };
}

function auth(req) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  const row = token && db.prepare('SELECT user_id FROM tokens WHERE hash = ?').get(sha(token));
  if (!row) throw new HttpError(401, 'Sesión no válida.');
  return { userId: row.user_id, token };
}

/* ---------- Estado sincronizado ----------
   El servidor guarda un documento por usuario con un número de revisión.
   Para escribir hay que enviar la revisión leída; si otro dispositivo escribió
   antes se responde 409 con el estado actual y el cliente fusiona y reintenta. */
function getState(userId) {
  const row = db.prepare('SELECT rev, data FROM states WHERE user_id = ?').get(userId);
  return row ? { rev: row.rev, data: JSON.parse(row.data) } : { rev: 0, data: null };
}

function putState(userId, body) {
  if (!body || typeof body.data !== 'object' || body.data === null) throw new HttpError(400, 'Falta "data".');
  const current = getState(userId);
  if (Number(body.baseRev) !== current.rev) return { status: 409, body: current };
  const rev = current.rev + 1;
  db.prepare(`INSERT INTO states (user_id, rev, data, updated_at) VALUES (?, ?, ?, ?)
              ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, data = excluded.data, updated_at = excluded.updated_at`)
    .run(userId, rev, JSON.stringify(body.data), Date.now());
  return { status: 200, body: { rev } };
}

/* ---------- HTTP ---------- */
async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Los datos superan el tamaño máximo.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new HttpError(400, 'JSON inválido.'); }
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
};

async function api(req, res, path) {
  const ip = req.socket.remoteAddress ?? '';
  const route = `${req.method} ${path}`;
  if (route === 'GET /api/health') return json(res, 200, { ok: true });
  if (route === 'POST /api/register') { throttle(ip); return json(res, 201, register(await readJson(req))); }
  if (route === 'POST /api/login') { throttle(ip); return json(res, 200, login(await readJson(req))); }

  const { userId, token } = auth(req);
  if (route === 'POST /api/logout') {
    db.prepare('DELETE FROM tokens WHERE hash = ?').run(sha(token));
    return json(res, 200, { ok: true });
  }
  if (route === 'GET /api/state') return json(res, 200, getState(userId));
  if (route === 'PUT /api/state') {
    const out = putState(userId, await readJson(req));
    return json(res, out.status, out.body);
  }
  if (route === 'DELETE /api/account') {
    db.prepare('DELETE FROM states WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM tokens WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    return json(res, 200, { ok: true });
  }
  throw new HttpError(404, 'No encontrado.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
// La app solo puede conectarse a este servidor y a la API de Anthropic.
const CSP = "default-src 'self'; connect-src 'self' https://api.anthropic.com; img-src 'self' data: blob:; " +
  "style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

function serveStatic(res, path) {
  let file = normalize(join(DIST, decodeURIComponent(path)));
  if (!file.startsWith(DIST)) throw new HttpError(403, 'Prohibido.');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  if (!existsSync(file)) throw new HttpError(503, 'Falta compilar la app: ejecutá "npm run build".');
  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(readFileSync(file));
}

createServer(async (req, res) => {
  try {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path.startsWith('/api/')) {
      // La APK llama desde otro origen. Se permite cualquiera porque la sesión
      // viaja en el encabezado Authorization, no en cookies.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      await api(req, res, path);
    }
    else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(res, path);
    else throw new HttpError(405, 'Método no permitido.');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    json(res, status, { error: status === 500 ? 'Error interno.' : e.message });
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Gym Tracker en http://localhost:${PORT}  (datos en ${DATA_DIR})`);
});
