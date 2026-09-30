import { h, $, api, action, connect, reconnect, createStage, confirmModal, toast, buzz, LETTERS, plural } from './core.js';
import { createCircuit } from './circuit.js';
import { startScreen, tieScreen, matchScreen, podiumScreen, FINALE_MS } from './screens.js';
import { serverNow } from './core.js';

const stage = createStage($('#stage'));
const dock = $('#dock');
const circuit = createCircuit();
dock.append(circuit.el);
const onlinePill = $('#online');
let last = null;

const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* navigation privée */ } },
};

/* ---------------- Connexion ---------------- */
const loginScreen = {
  key: () => 'login',
  enter: 'rise',
  mount() {
    const name = h('input', { class: 'field__input', name: 'name', autocomplete: 'given-name', required: true, maxlength: 40, placeholder: 'Ton prénom' });
    const age = h('input', { class: 'field__input', name: 'age', inputmode: 'numeric', pattern: '[0-9]*', required: true, maxlength: 3, placeholder: 'Ton âge (le nouveau 😉)' });
    const btn = h('button', { class: 'btn btn--love btn--block', type: 'submit', text: 'Se connecter' });
    const form = h('form', { class: 'login__form', novalidate: true },
      h('label', { class: 'field' }, h('span', { class: 'field__label', text: 'Prénom' }), name),
      h('label', { class: 'field' }, h('span', { class: 'field__label', text: 'Âge' }), age),
      btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      try { await api('oana/login', { name: name.value, age: age.value }); buzz(20); reconnect(); } catch (err) {
        toast(err.message, 'error'); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      } finally { btn.disabled = false; }
    });
    return h('section', { class: 'login' },
      h('div', { class: 'brand brand--xl' }, h('span', { class: 'brand__tyre', 'aria-hidden': 'true' }), h('span', { class: 'brand__name display', text: 'Pit Crush' })),
      h('p', { class: 'login__tag', text: 'L’appli de rencontre qui te trouve ton match… au volant.' }),
      h('div', { class: 'login__cards', 'aria-hidden': 'true' },
        h('div', { class: 'ghost-card ghost-card--1' }), h('div', { class: 'ghost-card ghost-card--2' }), h('div', { class: 'ghost-card ghost-card--3' })),
      form,
      h('p', { class: 'fine', text: 'Profil privé · 1 seule pilote autorisée 🔒' }));
  },
};

/* ---------------- Onboarding (3 cartes) ---------------- */
const SLIDES = [
  { emoji: '💘', title: 'Salut Oana !', text: 'Bienvenue sur Pit Crush, l’appli qui trouve ton activité de pilote parfaite.' },
  { emoji: '🏎️', title: '10 questions', text: 'Réponds avec ton cœur. Cinq voitures mystère se battent pour toi, chacune cache un cadeau.' },
  { emoji: '🏁', title: 'Une seule gagnera', text: 'À chaque réponse, les voitures bougent. La première à passer la ligne, c’est ton match.' },
];
const onboardingScreen = {
  key: () => 'onboarding',
  enter: 'zoom',
  mount() {
    let i = 0;
    const card = h('div', { class: 'onb__card' });
    const dots = h('div', { class: 'onb__dots' }, SLIDES.map(() => h('i')));
    const next = h('button', { class: 'btn btn--love btn--block', type: 'button' });
    const paint = () => {
      const s = SLIDES[i];
      card.replaceChildren(h('div', { class: 'onb__emoji', text: s.emoji }), h('h2', { class: 'title display', text: s.title }), h('p', { class: 'lead', text: s.text }));
      card.classList.remove('is-in'); void card.offsetWidth; card.classList.add('is-in');
      [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === i));
      next.textContent = i < SLIDES.length - 1 ? 'Suivant' : 'Créer mon profil de pilote';
    };
    next.addEventListener('click', () => {
      buzz(8);
      if (i < SLIDES.length - 1) { i++; paint(); return; }
      store.set('pc_onboarded', '1');
      if (last) render(last);
    });
    paint();
    return h('section', { class: 'onb' }, card, dots, next);
  },
};

/* ---------------- Grille de départ ---------------- */
const lobbyScreen = {
  key: () => 'lobby',
  enter: 'rise',
  mount() {
    const start = h('button', { class: 'btn btn--love btn--block btn--xl', type: 'button', text: 'Lancer la course 🏁' });
    action(start, async () => {
      const n = last?.counts.guests || 0;
      const ok = await confirmModal({
        title: 'Prête ?',
        text: n ? `${plural(n, 'ami est', 'amis sont')} sur la grille. Les paris seront fermés au départ.` : 'Personne n’a encore rejoint la grille. Lancer quand même ?',
        ok: 'Hai să mergem !',
      });
      if (ok) await api('oana/start');
    });
    return h('section', { class: 'lobby' },
      h('p', { class: 'eyebrow', text: 'Ton profil est prêt' }),
      h('h1', { class: 'title display', text: 'La grille de départ' }),
      h('p', { class: 'lead', text: 'Tes amis scannent le QR code pour parier sur une voiture et deviner tes réponses.' }),
      h('div', { class: 'qr' },
        h('img', { class: 'qr__img', src: '/api/qr.svg', alt: 'QR code pour rejoindre la partie', width: 220, height: 220 }),
        h('p', { class: 'qr__url', text: `${location.host}/jouer` })),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'stat__n display', dataset: { k: 'connected' } }), h('span', { class: 'stat__l', text: 'connectés' })),
        h('div', { class: 'stat' }, h('span', { class: 'stat__n display', dataset: { k: 'bets' } }), h('span', { class: 'stat__l', text: 'paris posés' }))),
      h('ul', { class: 'guests', 'aria-label': 'Amis sur la grille' }),
      h('div', { class: 'sticky-cta' }, start));
  },
  update(el, v) {
    el.querySelector('[data-k=connected]').textContent = v.counts.connected;
    el.querySelector('[data-k=bets]').textContent = `${v.counts.bets}/${v.counts.guests}`;
    const ul = el.querySelector('.guests');
    const names = v.guestNames || [];
    if (ul.dataset.sig !== names.join('|')) {
      ul.dataset.sig = names.join('|');
      ul.replaceChildren(...(names.length ? names.map((n) => h('li', { class: 'guest-chip' }, h('span', { class: 'guest-chip__av', text: [...n][0]?.toUpperCase() || '?' }), h('span', { text: n })))
        : [h('li', { class: 'guests__empty', text: 'En attente des premiers pilotes…' })]));
    }
  },
};

/* ---------------- Question ---------------- */
function qHeader(v) {
  const pips = h('div', { class: 'pips', 'aria-hidden': 'true' }, Array.from({ length: v.total }, (_, i) => h('i', { class: i < v.q ? 'is-done' : i === v.q ? 'is-cur' : '' })));
  return h('div', { class: 'qhead' },
    h('span', { class: 'qhead__n display', text: `Question ${v.q + 1}/${v.total}` }),
    v.question.lucky ? h('span', { class: 'chip chip--lucky', text: '🍀 n°7, ton chiffre porte-bonheur' }) : null,
    pips);
}

const questionScreen = {
  key: (v) => `q-${v.q}-${v.phaseAt}`,
  enter: 'card',
  leave: 'swipe',
  mount(v) {
    const reveal = h('button', { class: 'btn btn--love btn--block', type: 'button', text: 'Révéler ma réponse 💘' });
    action(reveal, () => api('oana/reveal'));
    const back = h('button', { class: 'link-btn', type: 'button', text: '← Question précédente', hidden: !v.canBack });
    action(back, async () => {
      if (await confirmModal({ title: 'Revenir en arrière ?', text: 'Tu pourras modifier ta réponse à la question précédente. Les voitures reculeront en conséquence.', ok: 'Oui, revenir' })) await api('oana/back');
    });
    const opts = v.question.options.map((text, i) => {
      const b = h('button', { class: 'opt', type: 'button', dataset: { i } },
        h('span', { class: `opt__k opt__k--${i}`, text: LETTERS[i] }),
        h('span', { class: 'opt__t', text }),
        h('span', { class: 'opt__check', 'aria-hidden': 'true', text: '❤' }));
      b.addEventListener('click', async () => {
        buzz(10);
        el.querySelectorAll('.opt').forEach((o) => o.classList.toggle('is-sel', o === b));
        el.classList.add('has-answer');
        try { await api('oana/answer', { o: i }); } catch (err) { toast(err.message, 'error'); }
      });
      return b;
    });
    const el = h('section', { class: 'question' },
      qHeader(v),
      h('div', { class: 'prompt' }, h('span', { class: 'prompt__label', text: 'Pit Crush te demande' }), h('h2', { class: 'prompt__text', text: v.question.text })),
      h('div', { class: 'opts' }, opts),
      h('div', { class: 'sticky-cta' },
        h('div', { class: 'answered' }, h('span', { class: 'answered__t' }), h('div', { class: 'answered__bar' }, h('i'))),
        reveal, back));
    return el;
  },
  update(el, v) {
    if (v.myAnswer != null) {
      el.classList.add('has-answer');
      el.querySelectorAll('.opt').forEach((o) => o.classList.toggle('is-sel', Number(o.dataset.i) === v.myAnswer));
    }
    const { answered, connected, guests } = v.counts;
    const base = Math.max(connected, answered);
    el.querySelector('.answered__t').textContent = guests
      ? `${answered}/${base} ${base > 1 ? 'amis ont' : 'ami a'} répondu · ${connected} en ligne`
      : 'Aucun ami connecté : tu joues en solo';
    el.querySelector('.answered__bar i').style.width = `${base ? (100 * answered) / base : 0}%`;
    el.querySelector('.answered').classList.toggle('is-full', base > 0 && answered >= base);
  },
};

/* ---------------- Révélation ---------------- */
const revealScreen = {
  key: (v) => `r-${v.q}-${v.phaseAt}`,
  enter: 'rise',
  leave: 'swipe',
  mount(v) {
    const last10 = v.q === v.total - 1;
    const next = h('button', { class: 'btn btn--love btn--block', type: 'button', text: last10 ? 'Franchir la ligne d’arrivée 🏁' : 'Question suivante →' });
    action(next, async () => {
      if (last10 && !(await confirmModal({ title: 'Dernier virage…', text: 'Une fois la ligne franchie, ton match sera révélé devant tout le monde. On y va ?', ok: 'On y va 🏁' }))) return;
      await api('oana/next');
    });
    const back = h('button', { class: 'link-btn', type: 'button', text: '← Modifier ma réponse' });
    action(back, async () => {
      if (await confirmModal({ title: 'Changer d’avis ?', text: 'Tu reviens à cette question pour modifier ta réponse.', ok: 'Oui, modifier' })) await api('oana/back');
    });
    const total = v.distribution.reduce((a, b) => a + b, 0);
    const rows = v.question.options.map((text, i) => h('div', { class: `dist ${i === v.oanaAnswer ? 'is-hers' : ''}` },
      h('span', { class: `opt__k opt__k--${i}`, text: LETTERS[i] }),
      h('div', { class: 'dist__main' }, h('span', { class: 'dist__t', text }),
        h('div', { class: 'dist__bar' }, h('i', { style: { '--w': `${total ? (100 * v.distribution[i]) / total : 0}%` } }))),
      h('span', { class: 'dist__n', text: String(v.distribution[i]) })));
    const right = v.rightGuesses || 0;
    return h('section', { class: 'reveal' },
      qHeader(v),
      h('p', { class: 'eyebrow', text: v.question.text }),
      h('h2', { class: 'title display reveal__verdict', text: total === 0 ? 'Réponse enregistrée' : right === 0 ? 'Personne ne t’a vue venir 😈' : right === total ? 'Tout le monde t’avait cernée 👀' : `${right} ${right > 1 ? 'amis t’avaient' : 'ami t’avait'} cernée 👀` }),
      h('div', { class: 'dists' }, rows),
      h('p', { class: 'reveal__hint', text: 'Regarde le circuit : les voitures ont bougé…' }),
      h('div', { class: 'sticky-cta' }, next, back));
  },
};

/* ---------------- Match & podium ---------------- */
const match = matchScreen('oana', {
  circuit, dock,
  extras: () => {
    const podium = h('button', { class: 'btn btn--love btn--block btn--xl', type: 'button', text: 'Annoncer le podium 🏆' });
    action(podium, () => api('oana/podium'));
    return [h('div', { class: 'match__cta' }, podium, replayBtn())];
  },
});
function replayBtn() {
  const b = h('button', { class: 'link-btn', type: 'button', text: '↻ Refaire le test' });
  action(b, async () => {
    if (await confirmModal({ title: 'Refaire le test ?', text: 'Ce résultat reste sauvegardé. Une nouvelle course repart de la grille, avec les mêmes amis.', ok: 'Nouvelle course' })) await api('oana/replay');
  });
  return b;
}
const podium = podiumScreen('oana', () => [h('div', { class: 'match__cta' }, replayBtn())]);
const tie = tieScreen('oana');

/* ---------------- Routage ---------------- */
function render(v) {
  last = v;
  document.body.dataset.phase = v.phase;
  onlinePill.textContent = `👥 ${v.counts?.connected ?? 0}`;
  onlinePill.hidden = v.role !== 'oana';

  if (v.role !== 'oana') { dock.dataset.mode = 'off'; return stage(loginScreen, v); }

  const fresh = v.phase === 'match' && serverNow() - v.phaseAt < FINALE_MS;
  dock.dataset.mode = { lobby: 'grid', start: 'grid', question: 'compact', reveal: 'large', tiebreak: 'compact' }[v.phase] || 'off';
  circuit.set(v, { dur: v.phase === 'match' && fresh ? 3000 : 1700 });
  if (v.phase !== 'match' && v.phase !== 'podium') circuit.highlight(null);

  if (v.phase === 'lobby' && !store.get('pc_onboarded')) { dock.dataset.mode = 'off'; return stage(onboardingScreen, v); }
  const screens = { lobby: lobbyScreen, start: startScreen, question: questionScreen, reveal: revealScreen, tiebreak: tie, match, podium };
  stage(screens[v.phase], v);
}

connect('oana', render);
