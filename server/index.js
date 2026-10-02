'use strict';
/*
 * Pit Crush — serveur HTTP sans framework ni dépendance (hors générateur de QR).
 *
 *  - pages statiques (chargées en mémoire au démarrage : seuls ces fichiers existent)
 *  - temps réel par Server-Sent Events (passe sans souci dans un tunnel Cloudflare)
 *  - actions en POST JSON, protégées par cookie de session HttpOnly + SameSite=Strict,
 *    vérification d'Origin et limitation de débit
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const qrcode = require('qrcode-generator');
const game = require('./game');
const { Store } = require('./store');

/* ------------------------------------------------------------------ */
/* Configuration                                                        */
/* ------------------------------------------------------------------ */

const env = process.env;
const CFG = {
  port: Number(env.PORT || 8080),
  oanaName: env.OANA_NAME || 'Oana',
  oanaAge: String(env.OANA_AGE || '').trim(),
  adminPassword: env.ADMIN_PASSWORD || '',
  publicUrl: (env.PUBLIC_URL || 'http://localhost:8080').replace(/\/+$/, ''),
  dataDir: env.DATA_DIR || path.join(__dirname, '..', 'data'),
  // Dossiers de photos, par ordre de priorité (tes photos perso d'abord, puis celles téléchargées au build).
  mediaDirs: (env.MEDIA_DIRS || [path.join(__dirname, '..', 'photos'), path.join(__dirname, '..', 'media')].join(':')).split(':').filter(Boolean),
  cookieSecure: env.COOKIE_SECURE !== '0',
  trustProxy: env.TRUST_PROXY === '1',
};

const fatal = (m) => { console.error(`[config] ${m}`); process.exit(1); };
if (!/^\d{1,3}$/.test(CFG.oanaAge)) fatal('OANA_AGE doit être défini (ex : OANA_AGE=27).');
if (CFG.adminPassword.length < 12) fatal('ADMIN_PASSWORD doit faire au moins 12 caractères.');
let PUBLIC_ORIGIN;
try { PUBLIC_ORIGIN = new URL(CFG.publicUrl).origin; } catch { fatal('PUBLIC_URL invalide.'); }

/* ------------------------------------------------------------------ */
/* État                                                                 */
/* ------------------------------------------------------------------ */

const store = new Store(CFG.dataDir);
let state = store.load() || game.newState();
const adminSessions = new Map(); // hash → expiration
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const safeEq = (a, b) => {
  const x = Buffer.from(sha(a)); const y = Buffer.from(sha(b));
  return crypto.timingSafeEqual(x, y);
};

function commit() {
  store.save(state);
  scheduleBroadcast();
}

function archiveRun() {
  if (state.phase === 'lobby') return;
  store.archive(state.runId, { archivedAt: new Date().toISOString(), ...game.adminView(state, liveInfo()) });
}

let goTimer = null;
function scheduleGo() {
  clearTimeout(goTimer);
  if (state.phase !== 'start') return;
  const delay = Math.max(0, state.lightsOutAt + 1400 - Date.now());
  goTimer = setTimeout(() => { if (game.actions.go(state, Date.now())) commit(); }, delay);
}
scheduleGo();

/* ------------------------------------------------------------------ */
/* Fichiers statiques (whitelist en mémoire)                            */
/* ------------------------------------------------------------------ */

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
};
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const assets = new Map();
(function loadDir(dir, prefix) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { loadDir(full, `${prefix}${f.name}/`); continue; }
    const type = TYPES[path.extname(f.name)];
    if (!type) continue;
    const buf = fs.readFileSync(full);
    assets.set(`/${prefix}${f.name}`, {
      buf, type, etag: `"${sha(buf).slice(0, 16)}"`,
      cache: f.name.endsWith('.woff2') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  }
})(PUBLIC_DIR, '');
const PAGES = { '/': '/oana.html', '/jouer': '/guest.html', '/regie': '/admin.html' };

/* QR code du lien invités : généré une fois, en SVG vectoriel. */
const QR_SVG = (() => {
  const qr = qrcode(0, 'M');
  qr.addData(`${CFG.publicUrl}/jouer`);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path fill="#111" d="${d}"/></svg>`;
})();

/* ------------------------------------------------------------------ */
/* Sécurité HTTP                                                        */
/* ------------------------------------------------------------------ */

const CSP = [
  "default-src 'none'", "script-src 'self'", "style-src 'self'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'self'", "manifest-src 'self'", "base-uri 'none'",
  "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function baseHeaders(res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (CFG.cookieSecure) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

function clientIp(req) {
  if (CFG.trustProxy) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf.length < 64) return cf;
  }
  return req.socket.remoteAddress || '?';
}

/** Limiteur à fenêtre fixe : clé → {n, reset}. */
const buckets = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.n++;
  return b.n > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
  for (const [k, exp] of adminSessions) if (exp < now) adminSessions.delete(k);
}, 60_000).unref();

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${CFG.cookieSecure ? '; Secure' : ''}`;
}

function newSid() { return crypto.randomBytes(32).toString('base64url'); }

/** Identifie le visiteur à partir de son cookie. */
function whoIs(req) {
  const c = parseCookies(req);
  const who = { role: 'anon', admin: false };
  if (c.pc_adm && /^[\w-]{43}$/.test(c.pc_adm)) {
    const exp = adminSessions.get(sha(c.pc_adm));
    if (exp && exp > Date.now()) who.admin = true;
  }
  if (c.pc_sid && /^[\w-]{43}$/.test(c.pc_sid)) {
    const h = sha(c.pc_sid);
    if (state.oanaSid && h === state.oanaSid) { who.role = 'oana'; return who; }
    for (const [gid, g] of Object.entries(state.guests)) {
      if (g.sid === h) { who.role = 'guest'; who.gid = gid; return who; }
    }
  }
  return who;
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store', ...extra });
  res.end(buf);
}
const fail = (res, status, error, extra) => send(res, status, { error }, undefined, status === 413 ? { Connection: 'close', ...extra } : extra);

function readJson(req) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.startsWith('application/json')) return reject(Object.assign(new Error('JSON attendu'), { status: 415 }));
    let size = 0; let tooBig = false; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 4096) { if (!tooBig) { tooBig = true; reject(Object.assign(new Error('Requête trop grosse'), { status: 413 })); } return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooBig) return;
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

/** Anti-CSRF : un POST doit venir de notre propre origine. */
function originOk(req) {
  const o = req.headers.origin;
  if (!o) return req.headers['sec-fetch-site'] ? req.headers['sec-fetch-site'] === 'same-origin' : true;
  if (o === PUBLIC_ORIGIN) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}

/* ------------------------------------------------------------------ */
/* Temps réel (SSE)                                                     */
/* ------------------------------------------------------------------ */

const clients = new Map(); // id → {res, req}
let clientSeq = 0;
const MAX_CLIENTS = 250;

function liveInfo() {
  const gids = new Set(); let oanaOnline = false;
  for (const { req } of clients.values()) {
    const w = whoIs(req);
    if (w.role === 'guest') gids.add(w.gid);
    if (w.role === 'oana') oanaOnline = true;
  }
  return { connectedGuests: gids.size, oanaOnline };
}

let bcastPending = false;
function scheduleBroadcast() {
  if (bcastPending) return;
  bcastPending = true;
  setTimeout(() => { bcastPending = false; broadcast(); }, 40);
}

function broadcast() {
  const live = liveInfo();
  const now = Date.now();
  for (const c of clients.values()) pushState(c, live, now);
}

function pushState(c, live = liveInfo(), now = Date.now()) {
  const who = whoIs(c.req);
  const payload = who.role === 'anon' && c.page !== 'guest' ? { now, role: 'anon', phase: state.phase } : game.view(state, who, live, now);
  if (who.role === 'anon') payload.role = 'anon';
  c.res.write(`event: state\ndata: ${JSON.stringify(payload)}\n\n`);
}

setInterval(() => { for (const c of clients.values()) c.res.write(`: ping ${Date.now()}\n\n`); }, 15_000).unref();

function openStream(req, res, url) {
  if (clients.size >= MAX_CLIENTS) return fail(res, 503, 'Trop de connexions.');
  const ip = clientIp(req);
  let perIp = 0;
  for (const c of clients.values()) if (c.ip === ip) perIp++;
  if (perIp >= 60) return fail(res, 429, 'Trop de connexions depuis ce réseau.');
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
  const id = ++clientSeq;
  const c = { req, res, ip, page: url.searchParams.get('p') === 'guest' ? 'guest' : 'oana' };
  clients.set(id, c);
  pushState(c);
  scheduleBroadcast(); // met à jour les compteurs de présence chez les autres
  req.on('close', () => { clients.delete(id); scheduleBroadcast(); });
}

/* ------------------------------------------------------------------ */
/* API                                                                  */
/* ------------------------------------------------------------------ */

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function run(fn) {
  const now = Date.now();
  fn(now);
  commit();
}

const ROUTES = {
  /* ---- Oana ---- */
  'oana/login': { auth: 'any', limit: [10, 10 * 60_000], handler(req, res, body, who, ip) {
    const okName = norm(body.name) === norm(CFG.oanaName);
    const okAge = String(body.age ?? '').trim().replace(/\s*ans?$/i, '') === CFG.oanaAge;
    if (!okName || !okAge) {
      console.log(`[login] échec depuis ${ip}`);
      return fail(res, 401, okName ? 'Hmm… ce n’est pas le bon âge 😏' : 'Ce profil est réservé à quelqu’un de très spécial 💘');
    }
    if (state.oanaSid && who.role !== 'oana') {
      console.log(`[login] refusé (profil verrouillé) depuis ${ip}`);
      return fail(res, 423, 'Oana est déjà connectée sur un autre téléphone. Demande à la régie de libérer le profil.');
    }
    if (who.role === 'oana') return send(res, 200, { ok: true });
    const sid = newSid();
    // Si ce téléphone était invité, il devient Oana (on retire l'invité).
    if (who.role === 'guest') delete state.guests[who.gid];
    state.oanaSid = sha(sid);
    commit();
    console.log(`[login] Oana connectée depuis ${ip}`);
    return send(res, 200, { ok: true }, undefined, { 'Set-Cookie': cookie('pc_sid', sid, 60 * 60 * 24 * 14) });
  } },
  'oana/start': { auth: 'oana', handler: (req, res) => { run((n) => game.actions.start(state, n)); scheduleGo(); send(res, 200, { ok: true }); } },
  'oana/answer': { auth: 'oana', handler: (req, res, b) => { run((n) => game.actions.oanaAnswer(state, n, b.o)); send(res, 200, { ok: true }); } },
  'oana/reveal': { auth: 'oana', handler: (req, res) => { run((n) => game.actions.reveal(state, n)); send(res, 200, { ok: true }); } },
  'oana/next': { auth: 'oana', handler: (req, res) => {
    run((n) => game.actions.next(state, n));
    if (state.phase === 'match') archiveRun();
    send(res, 200, { ok: true });
  } },
  'oana/back': { auth: 'oana', handler: (req, res) => { run((n) => game.actions.back(state, n)); send(res, 200, { ok: true }); } },
  'oana/tiepick': { auth: 'oana', handler: (req, res, b) => { run((n) => game.actions.tiePick(state, n, String(b.car))); archiveRun(); send(res, 200, { ok: true }); } },
  'oana/podium': { auth: 'oana', handler: (req, res) => { run((n) => game.actions.podium(state, n)); archiveRun(); send(res, 200, { ok: true }); } },
  'oana/replay': { auth: 'oana', handler: (req, res) => {
    if (state.phase !== 'match' && state.phase !== 'podium') return fail(res, 409, 'Termine d’abord la course 😉');
    archiveRun();
    state = game.newState(Date.now(), state);
    commit();
    console.log('[game] nouvelle partie (rejouer)');
    send(res, 200, { ok: true });
  } },

  /* ---- Invités ---- */
  'guest/join': { auth: 'any', limit: [40, 10 * 60_000], handler(req, res, body, who) {
    if (who.role === 'oana') return fail(res, 409, 'Tu es déjà connectée en tant qu’Oana 😄');
    if (who.role === 'guest') return send(res, 200, { ok: true });
    const sid = newSid();
    let gid;
    run((n) => { gid = game.actions.guestJoin(state, n, body.name, sha(sid)); });
    console.log(`[guest] ${state.guests[gid].name} a rejoint la grille`);
    send(res, 200, { ok: true }, undefined, { 'Set-Cookie': cookie('pc_sid', sid, 60 * 60 * 24 * 3) });
  } },
  'guest/bet': { auth: 'guest', handler: (req, res, b, who) => { run((n) => game.actions.guestBet(state, n, who.gid, String(b.car))); send(res, 200, { ok: true }); } },
  'guest/answer': { auth: 'guest', handler: (req, res, b, who) => { run((n) => game.actions.guestAnswer(state, n, who.gid, b.o)); send(res, 200, { ok: true }); } },
  'guest/vote': { auth: 'guest', handler: (req, res, b, who) => { run((n) => game.actions.guestVote(state, n, who.gid, String(b.car))); send(res, 200, { ok: true }); } },

  /* ---- Régie ---- */
  'admin/login': { auth: 'any', limit: [6, 15 * 60_000], handler(req, res, body, who, ip) {
    if (!safeEq(String(body.password ?? ''), CFG.adminPassword)) {
      console.log(`[admin] échec de connexion depuis ${ip}`);
      return fail(res, 401, 'Mot de passe incorrect.');
    }
    const sid = newSid();
    adminSessions.set(sha(sid), Date.now() + 12 * 3600_000);
    console.log(`[admin] connexion depuis ${ip}`);
    send(res, 200, { ok: true }, undefined, { 'Set-Cookie': cookie('pc_adm', sid, 12 * 3600) });
  } },
  'admin/reset': { auth: 'admin', handler: (req, res) => {
    archiveRun();
    state = game.newState(Date.now(), null, state.mode);
    clearTimeout(goTimer);
    commit();
    console.log('[admin] remise à zéro complète');
    send(res, 200, { ok: true });
  } },
  'admin/mode': { auth: 'admin', handler: (req, res, b) => {
    const mode = b.mode === 'test' ? 'test' : b.mode === 'real' ? 'real' : null;
    if (!mode) return fail(res, 400, 'Mode invalide.');
    archiveRun();
    // Changer de mode = nouvelle partie vierge (invités effacés, profil Oana libéré)
    state = game.newState(Date.now(), null, mode);
    clearTimeout(goTimer);
    commit();
    console.log(`[admin] mode ${mode === 'test' ? 'TEST' : 'RÉEL'} activé (nouvelle partie)`);
    send(res, 200, { ok: true });
  } },
  'admin/unlock': { auth: 'admin', handler: (req, res) => { state.oanaSid = null; commit(); console.log('[admin] profil Oana libéré'); send(res, 200, { ok: true }); } },
  'admin/kick': { auth: 'admin', handler: (req, res, b) => { run((n) => game.actions.kick(state, n, String(b.gid))); send(res, 200, { ok: true }); } },
};

async function handleApi(req, res, url, ip) {
  const name = url.pathname.slice('/api/'.length);

  if (req.method === 'GET') {
    if (name === 'stream') return openStream(req, res, url);
    if (name === 'qr.svg') return send(res, 200, QR_SVG, 'image/svg+xml', { 'Cache-Control': 'no-cache' });
    if (name === 'admin/state') {
      const who = whoIs(req);
      if (!who.admin) return fail(res, 401, 'Non autorisé.');
      return send(res, 200, { current: game.adminView(state, liveInfo()), runs: store.listRuns().slice(0, 20) });
    }
    return fail(res, 404, 'Introuvable.');
  }

  const route = ROUTES[name];
  if (req.method !== 'POST' || !route) return fail(res, 404, 'Introuvable.');
  if (!originOk(req)) return fail(res, 403, 'Origine refusée.');
  if (limited(`all:${ip}`, 300, 60_000)) return fail(res, 429, 'Doucement, pilote ! Réessaie dans un instant.');
  if (route.limit && limited(`${name}:${ip}`, route.limit[0], route.limit[1])) {
    return fail(res, 429, 'Trop de tentatives. Réessaie dans quelques minutes.');
  }

  const who = whoIs(req);
  if (route.auth === 'oana' && who.role !== 'oana') return fail(res, 403, 'Réservé à Oana 💘');
  if (route.auth === 'guest' && who.role !== 'guest') return fail(res, 403, 'Rejoins d’abord la partie.');
  if (route.auth === 'admin' && !who.admin) return fail(res, 401, 'Non autorisé.');
  if (who.role === 'guest' && limited(`g:${who.gid}`, 30, 10_000)) return fail(res, 429, 'Doucement !');

  const body = await readJson(req);
  try {
    await route.handler(req, res, body, who, ip);
  } catch (e) {
    if (e instanceof game.GameError) return fail(res, e.status, e.message);
    throw e;
  }
}

function serveMedia(req, res, url) {
  const m = /^\/media\/([a-z0-9]+-\d)\.jpg$/.exec(url.pathname);
  // Les photos ne sont servies qu'une fois le match révélé (le classement complet est alors visible).
  if (!m || !state.winner || (state.phase !== 'match' && state.phase !== 'podium')) return fail(res, 404, 'Introuvable.');
  const photos = Object.values(game.C(state).ACTIVITIES).flatMap((a) => a.photos);
  if (!photos.includes(m[1])) return fail(res, 404, 'Introuvable.');
  for (const dir of CFG.mediaDirs) for (const ext of ['jpg', 'jpeg', 'webp', 'png']) {
    const file = path.join(dir, `${m[1]}.${ext}`);
    try {
      const buf = fs.readFileSync(file);
      const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
      return send(res, 200, buf, type, { 'Cache-Control': 'private, max-age=3600' });
    } catch { /* essaie l'extension suivante */ }
  }
  return fail(res, 404, 'Introuvable.');
}

const server = http.createServer(async (req, res) => {
  baseHeaders(res);
  const ip = clientIp(req);
  let url;
  try { url = new URL(req.url, 'http://x'); } catch { return fail(res, 400, 'URL invalide.'); }
  try {
    if (url.pathname === '/healthz') return send(res, 200, 'ok', 'text/plain');
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url, ip);
    if (url.pathname.startsWith('/media/')) return serveMedia(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Méthode non autorisée.');
    if (limited(`static:${ip}`, 600, 60_000)) return fail(res, 429, 'Trop de requêtes.');
    const a = assets.get(PAGES[url.pathname] || url.pathname);
    if (!a) return send(res, 404, 'Introuvable', 'text/plain; charset=utf-8');
    if (req.headers['if-none-match'] === a.etag) { res.writeHead(304, { ETag: a.etag }); return res.end(); }
    res.writeHead(200, { 'Content-Type': a.type, 'Content-Length': a.buf.length, 'Cache-Control': a.cache, ETag: a.etag });
    return res.end(req.method === 'HEAD' ? undefined : a.buf);
  } catch (e) {
    if (e.status) return fail(res, e.status, e.message);
    console.error('[http] erreur', e);
    if (!res.headersSent) fail(res, 500, 'Erreur interne.');
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 65_000;
server.listen(CFG.port, () => {
  console.log(`[pit-crush] prêt sur :${CFG.port} — ${CFG.publicUrl} (partie ${state.runId}, phase ${state.phase})`);
});

function shutdown(sig) {
  console.log(`[pit-crush] ${sig} reçu, sauvegarde…`);
  store.flush();
  for (const c of clients.values()) c.res.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
