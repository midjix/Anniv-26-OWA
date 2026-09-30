/* Circuit générique en SVG, voitures anonymes animées, tour de classement, feux F1, confettis. */
import { h } from './core.js';

const TRACK_D = 'M110 196 L290 196 C352 196 384 166 374 128 C366 98 334 94 312 104 L262 124 C236 134 214 120 222 96 C230 72 268 72 280 52 C292 30 270 18 242 22 L128 36 C72 44 34 64 28 104 C22 146 44 196 110 196 Z';

/** Petite monoplace vue de dessus, orientée vers +x. */
function carShape(car) {
  return h('svg:g', { class: 'car__shape' },
    h('svg:rect', { x: -12, y: -6.5, width: 3.2, height: 13, rx: 1, fill: '#0c0c0e' }),
    h('svg:rect', { x: -9.5, y: -6, width: 4.5, height: 3, rx: 1, fill: '#0c0c0e' }),
    h('svg:rect', { x: -9.5, y: 3, width: 4.5, height: 3, rx: 1, fill: '#0c0c0e' }),
    h('svg:rect', { x: 4.5, y: -5.6, width: 3.6, height: 2.6, rx: 1, fill: '#0c0c0e' }),
    h('svg:rect', { x: 4.5, y: 3, width: 3.6, height: 2.6, rx: 1, fill: '#0c0c0e' }),
    h('svg:path', { d: 'M-9 -2.6 C-4 -3.4 2 -2.8 6 -1.6 L13 -0.6 L13 0.6 L6 1.6 C2 2.8 -4 3.4 -9 2.6 Z', fill: car.color, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 0.5 }),
    h('svg:rect', { x: 11.5, y: -5, width: 2.2, height: 10, rx: 0.8, fill: car.trim }),
    h('svg:circle', { cx: -1.5, cy: 0, r: 1.5, fill: car.trim }),
  );
}

export function createCircuit({ tower = true } = {}) {
  const track = h('svg:path', { d: TRACK_D, class: 'track__path' });
  const carsLayer = h('svg:g', { class: 'track__cars' });
  const labelsLayer = h('svg:g', { class: 'track__labels' });
  const flag = h('svg:g', { class: 'track__line' });
  // damier sur la ligne de départ/arrivée
  for (let r = 0; r < 6; r++) for (let c = 0; c < 2; c++) {
    flag.append(h('svg:rect', { x: 108 + c * 2.5, y: 184 + r * 4, width: 2.5, height: 4, fill: (r + c) % 2 ? '#111' : '#fff' }));
  }
  const svg = h('svg:svg', { viewBox: '0 0 400 220', class: 'track__svg', role: 'img', 'aria-label': 'Circuit : position des voitures' },
    h('svg:defs', {},
      h('svg:filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
        h('svg:feGaussianBlur', { stdDeviation: 3, result: 'b' }),
        h('svg:feMerge', {}, h('svg:feMergeNode', { in: 'b' }), h('svg:feMergeNode', { in: 'SourceGraphic' })))),
    h('svg:path', { d: TRACK_D, class: 'track__runoff' }),
    h('svg:path', { d: TRACK_D, class: 'track__kerb' }),
    track,
    h('svg:path', { d: TRACK_D, class: 'track__center' }),
    flag,
    carsLayer,
    labelsLayer,
  );
  const towerEl = h('ol', { class: 'tower', 'aria-label': 'Classement' });
  const root = h('div', { class: 'track' }, h('div', { class: 'track__stage' }, svg), tower ? towerEl : null);

  const cars = new Map(); // id → {car, g, label, shown, from, to, t0, idx, towerRow}
  let len = 0; let raf = 0;

  function ensure(carList) {
    if (cars.size) return;
    carList.forEach((car, idx) => {
      const g = h('svg:g', { class: 'car', dataset: { car: car.id } }, carShape(car));
      const label = h('svg:g', { class: 'car__label' },
        h('svg:rect', { x: -8, y: -6, width: 16, height: 11, rx: 5.5, fill: car.color, stroke: car.trim, 'stroke-width': 0.8 }),
        h('svg:text', { x: 0, y: 2.6, 'text-anchor': 'middle', fill: car.trim, text: String(car.num) }));
      carsLayer.append(g); labelsLayer.append(label);
      const row = h('li', { class: 'tower__row' },
        h('span', { class: 'tower__pos' }),
        h('span', { class: 'tower__stripe', style: { background: car.color } }),
        h('span', { class: 'tower__num', text: `#${car.num}` }),
        h('span', { class: 'tower__delta' }));
      towerEl.append(row);
      cars.set(car.id, { car, g, label, shown: 0, from: 0, to: 0, t0: 0, dur: 1, idx, row, rank: idx + 1 });
    });
    for (const c of cars.values()) place(c, 0);
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  function place(c, p) {
    if (!Number.isFinite(p)) p = 0;
    if (!len) len = track.getTotalLength();
    if (!len) return;
    const lane = (c.idx - 2) * 3.6;
    // sur la grille de départ : décalage en quinconce derrière la ligne
    const grid = Math.max(0, 1 - p / 0.03) * (c.idx * 11 + 6);
    let d = p * len - grid;
    d = ((d % len) + len) % len;
    const a = track.getPointAtLength(d);
    const b = track.getPointAtLength((d + 1) % len);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = -Math.sin(ang); const ny = Math.cos(ang);
    const x = a.x + nx * lane; const y = a.y + ny * lane;
    c.g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(ang * 180 / Math.PI).toFixed(1)}) scale(1.45)`);
    c.label.setAttribute('transform', `translate(${(x + nx * 13).toFixed(2)} ${(y + ny * 13 - 6).toFixed(2)})`);
  }

  function tick() {
    const now = performance.now();
    let moving = false;
    for (const c of cars.values()) {
      const t = Math.min(1, (now - c.t0) / c.dur);
      c.shown = c.from + (c.to - c.from) * ease(t);
      if (t < 1) moving = true;
      place(c, c.shown);
    }
    root.classList.toggle('is-moving', moving);
    raf = moving ? requestAnimationFrame(tick) : 0;
  }

  function set(v, { dur = 1600, stagger = 90 } = {}) {
    ensure(v.cars);
    const order = [...cars.values()].sort((a, b) => (v.ranks[a.car.id] - v.ranks[b.car.id]) || a.idx - b.idx);
    order.forEach((c, i) => {
      const target = v.progress[c.car.id] ?? 0;
      if (Math.abs(target - c.to) > 1e-4) {
        c.from = c.shown; c.to = target; c.t0 = performance.now() + i * stagger;
        c.dur = dur * (0.85 + Math.random() * 0.3);
      }
      // tour de classement, style TV
      const prev = c.rank; c.rank = v.ranks[c.car.id];
      c.row.style.order = String(i);
      c.row.style.setProperty('--i', i);
      c.row.querySelector('.tower__pos').textContent = `P${v.revealed ? c.rank : i + 1}`;
      const d = c.row.querySelector('.tower__delta');
      d.textContent = prev > c.rank ? '▲' : prev < c.rank ? '▼' : '';
      d.className = `tower__delta ${prev > c.rank ? 'up' : prev < c.rank ? 'down' : ''}`;
      c.row.classList.toggle('is-leader', i === 0);
    });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function highlight(carId, { dim = true } = {}) {
    for (const c of cars.values()) {
      c.g.classList.toggle('is-dim', dim && !!carId && c.car.id !== carId);
      c.label.classList.toggle('is-dim', dim && !!carId && c.car.id !== carId);
      c.g.classList.toggle('is-hero', c.car.id === carId);
    }
  }

  /** Ramène les voitures à une position donnée sans animation. */
  function jump(v) {
    ensure(v.cars);
    for (const c of cars.values()) { c.shown = c.from = c.to = v.progress[c.car.id] ?? 0; c.t0 = 0; c.dur = 1; }
    set(v, { dur: 1 });
  }

  requestAnimationFrame(() => { for (const c of cars.values()) place(c, c.shown); });
  return { el: root, set, jump, highlight };
}

/** Voiture « de face » pour les cartes de pari / profils anonymes. */
export function carBadge(car, { size = 'md' } = {}) {
  return h('span', { class: `car-badge car-badge--${size}`, style: { '--car': car.color, '--trim': car.trim } },
    h('svg:svg', { viewBox: '-16 -9 32 18', class: 'car-badge__svg', 'aria-hidden': 'true' }, carShape(car)),
    h('span', { class: 'car-badge__num', text: `#${car.num}` }));
}

/* ---------------- Feux de départ F1 ---------------- */
export function createLights() {
  const pods = [];
  const gantry = h('div', { class: 'lights', 'aria-hidden': 'true' },
    ...Array.from({ length: 5 }, () => {
      const pod = h('div', { class: 'lights__pod' }, h('i'), h('i'), h('i'), h('i'));
      pods.push(pod); return pod;
    }));
  let raf = 0;
  function run(phaseAt, outAt, now, onOut) {
    cancelAnimationFrame(raf);
    let done = false;
    const loop = () => {
      const t = now();
      const lit = t >= outAt ? 0 : Math.max(0, Math.min(5, Math.floor((t - phaseAt) / 1000) + 1));
      pods.forEach((p, i) => p.classList.toggle('is-on', i < lit));
      if (t >= outAt && !done) { done = true; gantry.classList.add('is-out'); onOut?.(); }
      if (!done) raf = requestAnimationFrame(loop);
    };
    loop();
  }
  return { el: gantry, run };
}

/* ---------------- Confettis & damier ---------------- */
export function confetti({ count = 140, colors = ['#E10600', '#FF2D55', '#FFFFFF', '#FFC21A', '#111111'] } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = h('div', { class: 'confetti', 'aria-hidden': 'true' });
  document.body.append(layer);
  const W = innerWidth; const H = innerHeight;
  for (let i = 0; i < count; i++) {
    const p = h('i', { class: i % 7 === 0 ? 'is-check' : '' });
    p.style.background = i % 7 === 0 ? '' : colors[i % colors.length];
    p.style.left = `${Math.random() * 100}%`;
    layer.append(p);
    const x = (Math.random() - 0.5) * W * 0.5;
    p.animate([
      { transform: `translate(0, -20px) rotate(0deg)`, opacity: 1 },
      { transform: `translate(${x}px, ${H + 60}px) rotate(${Math.random() * 1080 - 540}deg)`, opacity: 0.9 },
    ], { duration: 2600 + Math.random() * 2200, delay: Math.random() * 700, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
  }
  setTimeout(() => layer.remove(), 6000);
}
