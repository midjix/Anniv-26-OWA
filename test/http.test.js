'use strict';
/* Tests d'intégration HTTP : sécurité, authentification, temps réel. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 18000 + Math.floor(Math.random() * 1000);
const B = `http://127.0.0.1:${PORT}`;
let srv;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-'));

test.before(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: { ...process.env, PORT, OANA_AGE: '26', ADMIN_PASSWORD: 'un-mot-de-passe-solide', COOKIE_SECURE: '0', DATA_DIR: dir, PUBLIC_URL: B },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${B}/healthz`)).ok) return; } catch { /* pas encore prêt */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('serveur non démarré');
});
test.after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

const post = (p, body, headers = {}) => fetch(`${B}/api/${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sid = (res) => (res.headers.get('set-cookie') || '').split(';')[0];

async function firstEvent(cookie, page = 'oana') {
  const ctrl = new AbortController();
  const res = await fetch(`${B}/api/stream?p=${page}`, { headers: cookie ? { cookie } : {}, signal: ctrl.signal });
  const reader = res.body.getReader();
  let buf = '';
  while (!buf.includes('event: state')) buf += new TextDecoder().decode((await reader.read()).value);
  while (!/event: state\ndata: .*\n\n/.test(buf)) buf += new TextDecoder().decode((await reader.read()).value);
  ctrl.abort();
  return JSON.parse(/data: (.*)\n\n/.exec(buf)[1]);
}

test('en-têtes de sécurité présents', async () => {
  const r = await fetch(`${B}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('aucun fichier hors whitelist, pas de traversée de répertoire', async () => {
  for (const p of ['/../server/content.js', '/%2e%2e/server/content.js', '/server/content.js', '/package.json', '/.env']) {
    const r = await fetch(B + p);
    assert.equal(r.status, 404, p);
  }
});

test('connexion Oana : mauvais âge refusé, bon âge accepté, profil ensuite verrouillé', async () => {
  assert.equal((await post('oana/login', { name: 'Oana', age: '25' })).status, 401);
  assert.equal((await post('oana/login', { name: 'Paul', age: '26' })).status, 401);
  const ok = await post('oana/login', { name: '  OANA ', age: '26' });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  const v = await firstEvent(sid(ok));
  assert.equal(v.role, 'oana');
  // un 2e téléphone ne peut pas prendre sa place
  assert.equal((await post('oana/login', { name: 'oana', age: '26' })).status, 423);
});

test('anti-CSRF : origine étrangère refusée', async () => {
  const r = await post('guest/join', { name: 'x' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('actions réservées : un invité ne peut pas piloter la partie', async () => {
  const j = await post('guest/join', { name: 'Max' });
  assert.equal(j.status, 200);
  const c = sid(j);
  assert.equal((await post('oana/start', {}, { cookie: c })).status, 403);
  assert.equal((await post('admin/reset', {}, { cookie: c })).status, 401);
  const v = await firstEvent(c, 'guest');
  assert.equal(v.role, 'guest');
  assert.equal(v.me.name, 'Max');
  assert.ok(!JSON.stringify(v).match(/rallye|meteo|spa"|carMap/));
});

test('photos inaccessibles avant le match', async () => {
  assert.equal((await fetch(`${B}/media/gt-1.jpg`)).status, 404);
});

test('corps JSON trop gros ou mal typé rejeté', async () => {
  assert.equal((await fetch(`${B}/api/guest/join`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' })).status, 415);
  assert.equal((await post('guest/join', { name: 'x'.repeat(5000) })).status, 413);
});

test('régie : mot de passe requis, limitation des tentatives', async () => {
  assert.equal((await fetch(`${B}/api/admin/state`)).status, 401);
  const ok = await post('admin/login', { password: 'un-mot-de-passe-solide' });
  assert.equal(ok.status, 200);
  const st = await (await fetch(`${B}/api/admin/state`, { headers: { cookie: sid(ok).replace('pc_sid', 'pc_adm') } })).json();
  assert.ok(st.current.carMap);
  let last;
  for (let i = 0; i < 8; i++) last = await post('admin/login', { password: 'faux' });
  assert.equal(last.status, 429);
});
