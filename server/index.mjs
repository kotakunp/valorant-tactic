// Production server: the built app, live-session sync (Hocuspocus over /collab),
// room links and image uploads, all on one port so Dokploy needs a single service.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@hocuspocus/server';
import sirv from 'sirv';
import * as Y from 'yjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const ROOMS = path.join(DATA, 'rooms');
const MEDIA = path.join(DATA, 'media');
const SHARES = path.join(DATA, 'shares');
const PORT = Number(process.env.PORT) || 3000;

const MAX_DOC_BYTES = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
/** A share request carries its images inline; once they're moved to /media the plan itself is small. */
const MAX_SHARE_REQUEST_BYTES = 16 * 1024 * 1024;
const MAX_SHARE_PLAN_BYTES = 1024 * 1024;
const SHARE_RE = /^[A-Za-z0-9_-]{10}$/;
const DATA_IMAGE_RE = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/]+=*)$/;
const ROOM_RE = /^[A-Za-z0-9_-]{16}$/;
const MEDIA_RE = /^[a-f0-9]{32}\.(webp|jpg|png)$/;
const MEDIA_SRC_RE = /^\/media\/[a-f0-9]{32}\.(webp|jpg|png)$/;
const MEDIA_TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

for (const dir of [ROOMS, MEDIA, SHARES]) mkdirSync(dir, { recursive: true });

/** Room links are HMACs of the room id, so the server keeps no token table. Losing the secret invalidates every link. */
function loadSecret() {
  if (process.env.COLLAB_SECRET) return process.env.COLLAB_SECRET;
  const file = path.join(DATA, 'secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('base64url');
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
const SECRET = loadSecret();

const sign = (role, room) => createHmac('sha256', SECRET).update(`${role}:${room}`).digest('base64url').slice(0, 24);

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 'edit', 'view' or null for a token on a room. */
function roleFor(room, token) {
  if (!ROOM_RE.test(room) || !token) return null;
  if (same(token, sign('edit', room))) return 'edit';
  if (same(token, sign('view', room))) return 'view';
  return null;
}

const roomFile = (room) => path.join(ROOMS, `${room}.ydoc`);

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, file);
}

// ---------- tiny per-IP rate limit for the HTTP API ----------

const buckets = new Map();
function limited(req, key, max, windowMs) {
  const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const id = `${key}:${ip}`;
  const now = Date.now();
  const b = buckets.get(id);
  if (!b || b.reset < now) {
    buckets.set(id, { count: 1, reset: now + windowMs });
    return false;
  }
  b.count += 1;
  return b.count > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [id, b] of buckets) if (b.reset < now) buckets.delete(id);
}, 60_000).unref();

// ---------- HTTP helpers ----------

function send(res, status, body, headers = {}) {
  const json = typeof body !== 'string';
  res.writeHead(status, {
    'Content-Type': json ? 'application/json' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(json ? JSON.stringify(body) : body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Trust the bytes, not the Content-Type header. */
function imageType(buf) {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  return null;
}

/** Saves image bytes under their content hash and returns the /media URL, or null if they aren't an image. */
async function storeImage(buf) {
  const ext = imageType(buf);
  if (!ext) return null;
  const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
  const file = path.join(MEDIA, name);
  if (!existsSync(file)) await writeAtomic(file, buf);
  return `/media/${name}`;
}

class BadShare extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Freezes a strategy and returns its short id. Ids are content hashes, so sharing the same
 * strategy twice gives the same link and nothing is ever overwritten.
 */
async function createShare(body) {
  let plan;
  try {
    plan = JSON.parse(body.toString('utf8'));
  } catch {
    throw new BadShare('That is not a strategy');
  }
  if (!plan || typeof plan !== 'object' || typeof plan.mapId !== 'string' || !Array.isArray(plan.steps)) throw new BadShare('That is not a strategy');
  if (!plan.steps.length || plan.steps.length > 200) throw new BadShare('That is not a strategy');
  // Library details, session credentials and timestamps stay private (and would defeat de-duplication).
  const { id: _id, folder: _folder, tags: _tags, live: _live, updatedAt: _updatedAt, ...rest } = plan;
  for (const step of rest.steps) {
    if (!step || typeof step !== 'object' || !Array.isArray(step.elements)) throw new BadShare('That is not a strategy');
    const kept = [];
    for (const el of step.elements) {
      if (el?.kind === 'image') {
        const m = typeof el.src === 'string' ? el.src.match(DATA_IMAGE_RE) : null;
        if (m) {
          const buf = Buffer.from(m[1], 'base64');
          const url = buf.length <= MAX_IMAGE_BYTES ? await storeImage(buf) : null;
          if (!url) continue;
          el.src = url;
        } else if (typeof el.src !== 'string' || !MEDIA_SRC_RE.test(el.src)) {
          continue;
        }
      }
      kept.push(el);
    }
    step.elements = kept;
  }
  const json = JSON.stringify(rest);
  if (Buffer.byteLength(json) > MAX_SHARE_PLAN_BYTES) throw new BadShare('That strategy is too large to share as a link', 413);
  const id = createHash('sha256').update(json).digest('base64url').slice(0, 10);
  const file = path.join(SHARES, `${id}.json`);
  if (!existsSync(file)) await writeAtomic(file, json);
  return id;
}

const statics = existsSync(DIST)
  ? sirv(DIST, {
      single: true,
      etag: true,
      gzip: true,
      brotli: true,
      setHeaders(res, pathname) {
        if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    })
  : (_req, res) => send(res, 404, 'Run `npm run build` first, or use the Vite dev server.');

async function handleApi(req, res, url) {
  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    if (limited(req, 'rooms', 30, 10 * 60_000)) return send(res, 429, { error: 'Too many new sessions. Try again in a few minutes.' });
    const room = randomBytes(12).toString('base64url');
    return send(res, 201, { room, edit: sign('edit', room), view: sign('view', room) });
  }

  const media = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9_-]{16})\/media$/);
  if (media && req.method === 'POST') {
    const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
    if (roleFor(media[1], token) !== 'edit') return send(res, 403, { error: 'Only editors can add images' });
    if (limited(req, 'media', 120, 10 * 60_000)) return send(res, 429, { error: 'Too many uploads. Try again in a few minutes.' });
    let body;
    try {
      body = await readBody(req, MAX_IMAGE_BYTES);
    } catch (err) {
      return send(res, err.status ?? 400, { error: err.status === 413 ? 'That image is too large' : 'Upload failed' });
    }
    const src = await storeImage(body);
    if (!src) return send(res, 415, { error: 'Only WebP, JPEG and PNG images are supported' });
    return send(res, 201, { url: src });
  }

  if (url.pathname === '/api/shares' && req.method === 'POST') {
    if (limited(req, 'shares', 60, 10 * 60_000)) return send(res, 429, { error: 'Too many share links. Try again in a few minutes.' });
    try {
      const id = await createShare(await readBody(req, MAX_SHARE_REQUEST_BYTES));
      return send(res, 201, { id });
    } catch (err) {
      if (err instanceof BadShare) return send(res, err.status, { error: err.message });
      if (err.status === 413) return send(res, 413, { error: 'That strategy is too large to share as a link' });
      throw err;
    }
  }

  const share = url.pathname.match(/^\/api\/shares\/([A-Za-z0-9_-]+)$/);
  if (share && req.method === 'GET') {
    if (!SHARE_RE.test(share[1])) return send(res, 404, { error: 'Not found' });
    let json;
    try {
      json = await readFile(path.join(SHARES, `${share[1]}.json`));
    } catch {
      return send(res, 404, { error: 'That share link does not exist' });
    }
    res.writeHead(200, {
      'Content-Type': 'application/json',
      // The id is a hash of the content, so a share never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return res.end(json);
  }

  return send(res, 404, { error: 'Not found' });
}

async function handleMedia(req, res, name) {
  if (!MEDIA_RE.test(name)) return send(res, 404, 'Not found');
  const file = path.join(MEDIA, name);
  let info;
  try {
    info = await stat(file);
  } catch {
    return send(res, 404, 'Not found');
  }
  res.writeHead(200, {
    'Content-Type': MEDIA_TYPES[name.split('.').pop()],
    'Content-Length': info.size,
    // Names are content hashes, so a file never changes.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function handleRequest(req, res) {
  const url = new URL(req.url ?? '/', 'http://local');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (url.pathname === '/healthz') return send(res, 200, 'ok');
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Server error' });
    });
    return;
  }
  if (url.pathname.startsWith('/media/') && (req.method === 'GET' || req.method === 'HEAD')) {
    handleMedia(req, res, url.pathname.slice('/media/'.length)).catch(() => send(res, 500, 'Server error'));
    return;
  }
  statics(req, res, () => send(res, 404, 'Not found'));
}

// ---------- live sessions ----------

const server = new Server({
  port: PORT,
  quiet: true,
  // Hocuspocus stores 2 s after the last change, at most every 10 s while edits keep coming.
  debounce: 2000,
  maxDebounce: 10_000,
  websocketOptions: { maxPayload: MAX_DOC_BYTES },

  async onRequest({ request, response }) {
    handleRequest(request, response);
    // Rejecting with nothing tells Hocuspocus the response is handled.
    throw null;
  },

  async onUpgrade({ request, socket }) {
    const { pathname } = new URL(request.url ?? '/', 'http://local');
    if (pathname !== '/collab') {
      socket.destroy();
      throw null;
    }
  },

  async onAuthenticate({ documentName, token, connectionConfig }) {
    const role = roleFor(documentName, token);
    if (!role) throw new Error('This live link is invalid');
    if (role === 'view') connectionConfig.readOnly = true;
    return { role };
  },

  async onLoadDocument({ documentName, document }) {
    try {
      Y.applyUpdate(document, await readFile(roomFile(documentName)));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    return document;
  },

  async onStoreDocument({ documentName, document }) {
    const update = Y.encodeStateAsUpdate(document);
    if (update.length > MAX_DOC_BYTES) {
      console.warn(`Room ${documentName} is ${update.length} bytes; not saving`);
      return;
    }
    await writeAtomic(roomFile(documentName), update);
  },
});

await server.listen();
console.log(`Valo Tactic on :${PORT} (data in ${DATA})`);
