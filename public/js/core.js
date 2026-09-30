/* Socle commun : DOM, API, temps réel (SSE), synchronisation d'horloge, écrans. */

/** Création d'éléments sans innerHTML (aucune injection possible). */
export function h(tag, attrs = {}, ...children) {
  const svg = tag.startsWith('svg:');
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'style') for (const [p, val] of Object.entries(v)) { if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val; }
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);

/* ---------------- Horloge serveur ---------------- */
let offset = 0;
export const serverNow = () => Date.now() + offset;
function syncClock(now) {
  if (typeof now !== 'number') return;
  const o = now - Date.now();
  // lissage : on évite les sauts dus à la latence réseau
  offset = offset === 0 ? o : offset * 0.7 + o * 0.3;
}

/* ---------------- API ---------------- */
export async function api(path, body = {}) {
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* vide */ }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Oups, erreur réseau.'), { status: res.status });
  return data;
}

/** Bouton qui appelle l'API avec état « chargement » et affichage d'erreur. */
export function action(btn, fn) {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('is-busy');
    try { await fn(); } catch (err) { toast(err.message, 'error'); } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  });
  return btn;
}

/* ---------------- Temps réel ---------------- */
let reopen = () => {};
/** À appeler après une connexion : le flux doit repartir avec le nouveau cookie. */
export const reconnect = () => reopen();

export function connect(page, onState) {
  const pill = h('div', { class: 'net-pill', text: 'Reconnexion…', role: 'status' });
  document.body.append(pill);
  let es; let lastMsg = Date.now();
  const open = () => {
    es = new EventSource(`/api/stream?p=${page}`);
    es.addEventListener('state', (e) => {
      lastMsg = Date.now();
      pill.classList.remove('is-on');
      let v; try { v = JSON.parse(e.data); } catch { return; }
      syncClock(v.now);
      onState(v);
    });
    es.addEventListener('open', () => { lastMsg = Date.now(); });
    es.onerror = () => { pill.classList.add('is-on'); };
  };
  open();
  reopen = () => { es.close(); open(); };
  // Chien de garde : les pings arrivent toutes les 15 s. Sans rien depuis 40 s, on rouvre.
  setInterval(() => {
    if (Date.now() - lastMsg > 40_000) { pill.classList.add('is-on'); es.close(); lastMsg = Date.now(); open(); }
  }, 5000);
  // Retour au premier plan (téléphone verrouillé) : reconnexion immédiate.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && es.readyState === EventSource.CLOSED) open();
    if (document.visibilityState === 'visible') keepAwake();
  });
  keepAwake();
}

/* Empêche l'écran de se mettre en veille pendant la partie. */
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* pas grave */ }
}

export function buzz(pattern = 12) { try { navigator.vibrate?.(pattern); } catch { /* */ } }

/* ---------------- Toast & modale ---------------- */
export function toast(msg, kind = 'info') {
  const t = h('div', { class: `toast toast--${kind}`, role: 'alert', text: msg });
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('is-in'));
  setTimeout(() => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 400); }, 3200);
}

export function confirmModal({ title, text, ok = 'Confirmer', cancel = 'Annuler', danger = false }) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.classList.remove('is-in'); setTimeout(() => wrap.remove(), 300); resolve(v); };
    const wrap = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', onclick: (e) => { if (e.target === wrap) close(false); } },
      h('div', { class: 'modal__card' },
        h('h3', { class: 'modal__title display', text: title }),
        h('p', { class: 'modal__text', text }),
        h('div', { class: 'modal__actions' },
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => close(false), text: cancel }),
          h('button', { class: `btn ${danger ? 'btn--danger' : 'btn--love'}`, type: 'button', onclick: () => close(true), text: ok }),
        )));
    document.body.append(wrap);
    requestAnimationFrame(() => wrap.classList.add('is-in'));
  });
}

/* ---------------- Gestion des écrans avec transitions ---------------- */
/**
 * Un écran = { key(v), mount(v) → Element, update?(el, v), leave? }
 * Tant que la clé ne change pas, on met simplement à jour ; sinon on
 * anime la sortie de l'ancien écran et l'entrée du nouveau.
 */
export function createStage(root) {
  let cur = null; // {key, el, screen}
  return function show(screen, v) {
    const key = screen.key(v);
    if (cur && cur.key === key) { screen.update?.(cur.el, v); return; }
    const el = screen.mount(v);
    el.classList.add('screen');
    if (cur) {
      const old = cur.el;
      old.classList.add(`leave--${cur.screen.leave || 'fade'}`);
      old.setAttribute('aria-hidden', 'true');
      setTimeout(() => old.remove(), 650);
    }
    el.classList.add(`enter--${screen.enter || 'rise'}`);
    root.append(el);
    screen.update?.(el, v);
    cur = { key, el, screen };
    el.scrollTop = 0;
    window.scrollTo({ top: 0 });
  };
}

/* ---------------- Utilitaires ---------------- */
export const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n);
export const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
export const LETTERS = ['A', 'B', 'C', 'D'];
