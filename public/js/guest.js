import { h, $, api, action, connect, reconnect, createStage, toast, buzz, fmt, serverNow } from './core.js';
import { createCircuit, carBadge } from './circuit.js';
import { startScreen, tieScreen, matchScreen, podiumScreen, FINALE_MS } from './screens.js';

const stage = createStage($('#stage'));
const dock = $('#dock');
const circuit = createCircuit();
dock.append(circuit.el);
const mePill = $('#me');
const SHAPES = ['▲', '◆', '●', '■'];

/* ---------------- Rejoindre ---------------- */
const joinScreen = {
  key: () => 'join',
  mount(v) {
    const closed = v.phase === 'podium';
    const name = h('input', { class: 'field__input', maxlength: 18, required: true, autocomplete: 'nickname', placeholder: 'Ton pseudo de pilote' });
    const btn = h('button', { class: 'btn btn--love btn--block', type: 'submit', text: 'Rejoindre la grille' });
    const form = h('form', { class: 'login__form' }, h('label', { class: 'field' }, h('span', { class: 'field__label', text: 'Pseudo' }), name), btn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!name.value.trim()) { name.focus(); return; }
      btn.disabled = true;
      try { await api('guest/join', { name: name.value }); buzz(20); reconnect(); } catch (err) { toast(err.message, 'error'); } finally { btn.disabled = false; }
    });
    return h('section', { class: 'login' },
      h('div', { class: 'brand brand--xl' }, h('span', { class: 'brand__tyre', 'aria-hidden': 'true' }), h('span', { class: 'brand__name display', text: 'Pit Crush' })),
      h('p', { class: 'login__tag', text: closed ? 'La course est terminée 🏁 Merci d’être venu !' : 'Oana cherche son match au volant. Parie sur la bonne voiture et devine ses réponses.' }),
      closed ? null : h('ul', { class: 'rules' },
        h('li', {}, h('b', { text: '🎟 Pari' }), ' : +2 777 pts si ta voiture gagne'),
        h('li', {}, h('b', { text: '⚡ Rapidité' }), ' : 500 à 1 000 pts par bonne réponse, selon ton temps et ton ordre d’arrivée'),
        h('li', {}, h('b', { text: '🍀 Question 7' }), ' : points doublés')),
      closed ? null : form);
  },
};

/* ---------------- Pari ---------------- */
const betScreen = {
  key: () => 'bet',
  mount(v) {
    const grid = h('div', { class: 'bets' }, v.cars.map((car) => {
      const b = h('button', { class: 'bet', type: 'button', dataset: { car: car.id }, style: { '--car': car.color } },
        carBadge(car, { size: 'lg' }),
        h('span', { class: 'bet__odds', text: 'Voiture mystère' }),
        h('span', { class: 'bet__count' }));
      action(b, async () => { await api('guest/bet', { car: car.id }); buzz(15); });
      return b;
    }));
    return h('section', { class: 'bet-screen' },
      h('p', { class: 'eyebrow', dataset: { k: 'hello' } }),
      h('h1', { class: 'title display', text: 'Sur qui tu paries ?' }),
      h('p', { class: 'lead', text: 'Chaque voiture cache une activité, et personne ne sait laquelle. Choisis celle qui passera la ligne en premier.' }),
      grid,
      h('div', { class: 'waiting' }, h('span', { class: 'waiting__dot' }), h('span', { dataset: { k: 'wait' } })));
  },
  update(el, v) {
    el.querySelector('[data-k=hello]').textContent = `Salut ${v.me.name} 👋`;
    el.querySelectorAll('.bet').forEach((b) => b.classList.toggle('is-sel', b.dataset.car === v.me.bet));
    el.querySelector('[data-k=wait]').textContent = v.me.bet
      ? `Pari enregistré ✔ ${v.counts.guests} pilotes sur la grille. Oana va bientôt donner le départ…`
      : `${v.counts.guests} pilotes sur la grille · Tu peux changer d’avis jusqu’au départ`;
  },
};

/* ---------------- Question (façon Kahoot) ---------------- */
const questionScreen = {
  key: (v) => `q-${v.q}-${v.phaseAt}`,
  enter: 'card',
  leave: 'swipe',
  mount(v) {
    const btns = v.question.options.map((text, i) => {
      const b = h('button', { class: `kbtn kbtn--${i}`, type: 'button', dataset: { i } },
        h('span', { class: 'kbtn__shape', 'aria-hidden': 'true', text: SHAPES[i] }),
        h('span', { class: 'kbtn__t', text }));
      b.addEventListener('click', async () => {
        if (el.classList.contains('is-locked')) return;
        el.classList.add('is-locked'); b.classList.add('is-sel'); buzz(25);
        try { await api('guest/answer', { o: i }); } catch (err) { toast(err.message, 'error'); el.classList.remove('is-locked'); b.classList.remove('is-sel'); }
      });
      return b;
    });
    const el = h('section', { class: 'gq' },
      h('div', { class: 'qhead' },
        h('span', { class: 'qhead__n display', text: `Question ${v.q + 1}/${v.total}` }),
        v.question.lucky ? h('span', { class: 'chip chip--lucky', text: '🍀 Points doublés' }) : null),
      h('p', { class: 'gq__ask', text: 'Qu’a répondu Oana ?' }),
      h('h2', { class: 'prompt__text', text: v.question.text }),
      h('div', { class: 'kgrid' }, btns),
      h('div', { class: 'locked' }, h('span', { class: 'locked__icon', text: '🔒' }), h('span', { class: 'locked__t' })));
    return el;
  },
  update(el, v) {
    if (v.myAnswer) {
      el.classList.add('is-locked');
      el.querySelectorAll('.kbtn').forEach((b) => b.classList.toggle('is-sel', Number(b.dataset.i) === v.myAnswer.o));
      const o = v.myAnswer.order;
      el.querySelector('.locked__t').textContent = `Réponse verrouillée en ${(v.myAnswer.ms / 1000).toFixed(1).replace('.', ',')} s · ${o === 1 ? '1er·e à répondre ⚡' : `${o}e à répondre`} · ${v.counts.answered}/${Math.max(v.counts.connected, v.counts.answered)} ont répondu`;
    }
  },
};

/* ---------------- Révélation ---------------- */
const revealScreen = {
  key: (v) => `r-${v.q}-${v.phaseAt}`,
  enter: 'zoom',
  leave: 'swipe',
  mount(v) {
    const mine = v.myAnswer;
    const ok = mine && mine.o === v.oanaAnswer;
    buzz(ok ? [20, 40, 20] : 60);
    return h('section', { class: `gr ${ok ? 'is-ok' : 'is-ko'}` },
      h('div', { class: 'gr__badge', 'aria-hidden': 'true', text: ok ? '✔' : mine ? '✘' : '⌛' }),
      h('h2', { class: 'title display', text: ok ? 'Bien vu !' : mine ? 'Raté !' : 'Trop tard !' }),
      h('p', { class: 'gr__pts display', text: ok ? `+${fmt(v.gained)}` : '+0' }),
      h('div', { class: 'gr__answer' },
        h('span', { class: 'eyebrow', text: 'Oana a répondu' }),
        h('p', {}, h('span', { class: `kchip kbtn--${v.oanaAnswer}`, text: SHAPES[v.oanaAnswer] }), ' ', v.question.options[v.oanaAnswer])),
      h('p', { class: 'gr__rank', text: `Tu es P${v.me.rank} sur ${v.me.of} · ${fmt(v.me.points)} pts` }));
  },
};

/* ---------------- Match & podium ---------------- */
const betResult = (v) => {
  const car = v.cars.find((c) => c.id === v.me.bet);
  if (!car) return h('p', { class: 'bet-result', text: 'Tu n’avais pas parié… la prochaine fois, fonce 😉' });
  return h('div', { class: `bet-result ${v.me.betWon ? 'is-won' : ''}` }, carBadge(car, { size: 'sm' }),
    h('span', { text: v.me.betWon ? 'Ta voiture a gagné ! +2 777 pts 🎉' : 'Ta voiture n’a pas gagné… pas grave !' }));
};
const match = matchScreen('guest', { circuit, dock, extras: (v) => [betResult(v), h('p', { class: 'waiting' }, h('span', { class: 'waiting__dot' }), 'Le podium arrive…')] });
const podium = podiumScreen('guest', (v) => [h('p', { class: 'me-rank display', text: `Tu termines P${v.me.rank}${v.me.rank === 1 ? ' 🏆' : ''} · ${fmt(v.me.points)} pts` })]);
const tie = tieScreen('guest');

function render(v) {
  document.body.dataset.phase = v.phase;
  if (v.role !== 'guest') { dock.dataset.mode = 'off'; mePill.hidden = true; return stage(joinScreen, v); }
  mePill.hidden = false;
  mePill.textContent = `${v.me.name} · ${fmt(v.me.points)} pts`;
  const fresh = v.phase === 'match' && serverNow() - v.phaseAt < FINALE_MS;
  dock.dataset.mode = { lobby: 'grid', start: 'grid', question: 'compact', reveal: 'large', tiebreak: 'compact' }[v.phase] || 'off';
  circuit.set(v, { dur: fresh ? 3000 : 1700 });
  if (v.phase !== 'match' && v.phase !== 'podium') circuit.highlight(v.me.bet, { dim: false });
  const screens = { lobby: betScreen, start: startScreen, question: questionScreen, reveal: revealScreen, tiebreak: tie, match, podium };
  stage(screens[v.phase], v);
}

connect('guest', render);
