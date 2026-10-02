import { h, $, api, action, toast, confirmModal, fmt } from './core.js';

const root = $('#stage');
let timer = 0;

async function load() {
  const res = await fetch('/api/admin/state', { credentials: 'same-origin' });
  if (res.status === 401) return showLogin();
  const data = await res.json();
  paint(data);
  clearTimeout(timer);
  timer = setTimeout(load, 3000);
}

function showLogin() {
  const pwd = h('input', { id: 'pwd', class: 'field__input', type: 'password', autocapitalize: 'off', spellcheck: 'false', autocomplete: 'current-password', placeholder: 'Mot de passe régie' });
  const btn = h('button', { class: 'btn btn--love btn--block', type: 'submit', text: 'Entrer' });
  const eye = h('button', { class: 'field__eye', type: 'button', 'aria-label': 'Afficher le mot de passe', 'aria-pressed': 'false', text: '👁' });
  eye.addEventListener('click', () => {
    const show = pwd.type === 'password';
    pwd.type = show ? 'text' : 'password';
    eye.textContent = show ? '🙈' : '👁';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
    pwd.focus();
  });
  const form = h('form', { class: 'login__form' },
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 'pwd', text: 'Mot de passe' }), h('div', { class: 'field__wrap' }, pwd, eye)), btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('admin/login', { password: pwd.value }); load(); } catch (err) { toast(err.message, 'error'); }
  });
  root.replaceChildren(h('section', { class: 'login' }, h('h1', { class: 'title display', text: 'Régie' }), form));
}

const ACT = { gt: 'Voiture de sport (Mettet)', rallye: 'Rallye terre (Issoire)', meteo: 'Conditions difficiles (RACB)', spa: 'Spa-Francorchamps (Porsche)', f4: 'Formule 4 (Nürburgring)' };

function paint({ current: c, runs }) {
  const reset = h('button', { class: 'btn btn--danger', type: 'button', text: 'Remise à zéro complète' });
  action(reset, async () => {
    if (await confirmModal({ title: 'Tout effacer ?', text: 'Nouvelle partie vierge : invités supprimés, profil Oana libéré. La partie en cours est archivée.', ok: 'Remettre à zéro', danger: true })) { await api('admin/reset'); load(); }
  });
  const isTest = c.mode === 'test';
  const toggle = h('button', { class: `btn ${isTest ? 'btn--love' : 'btn--ghost'}`, type: 'button', text: isTest ? 'Repasser en mode RÉEL 🎂' : 'Activer le mode TEST 🧪' });
  action(toggle, async () => {
    const ok = await confirmModal({
      title: isTest ? 'Revenir au mode réel ?' : 'Passer en mode test ?',
      text: isTest
        ? 'Les vraies questions et les vrais cadeaux reviennent. La partie test est archivée, les testeurs sont déconnectés et le profil Oana est libéré.'
        : 'Questions et activités factices pour faire tester le site sans rien dévoiler. La partie en cours est archivée et remise à zéro (invités effacés, profil Oana libéré).',
      ok: isTest ? 'Mode réel' : 'Mode test', danger: !isTest,
    });
    if (ok) { await api('admin/mode', { mode: isTest ? 'real' : 'test' }); toast(isTest ? 'Mode RÉEL activé 🎂' : 'Mode TEST activé 🧪'); load(); }
  });
  const modeBox = h('div', { class: `mode-box ${isTest ? 'is-test' : 'is-real'}` },
    h('div', {},
      h('p', { class: 'mode-box__label', text: 'Contenu actuel' }),
      h('p', { class: 'mode-box__value display', text: isTest ? '🧪 MODE TEST' : '🎂 MODE RÉEL' }),
      h('p', { class: 'fine', text: isTest ? 'Questions et activités factices. Pense à repasser en mode réel avant l’anniversaire !' : 'Les vraies questions et les vrais cadeaux sont actifs.' })),
    toggle);
  const unlock = h('button', { class: 'btn btn--ghost', type: 'button', text: 'Libérer le profil d’Oana' });
  action(unlock, async () => { await api('admin/unlock'); toast('Profil libéré : Oana peut se reconnecter.'); load(); });

  const scores = Object.entries(c.activityScores).sort((a, b) => b[1] - a[1]);
  root.replaceChildren(h('section', { class: 'admin' },
    h('h1', { class: 'title display', text: 'Régie · Pit Crush' }),
    h('p', { class: 'lead', text: `Partie ${c.runId} · phase « ${c.phase} » · question ${c.q + 1} · Oana ${c.live.oanaOnline ? 'en ligne 🟢' : 'hors ligne ⚪'} · profil ${c.oanaLocked ? 'verrouillé 🔒' : 'libre'} · ${c.live.connectedGuests} invités en ligne` }),
    modeBox,
    h('div', { class: 'admin__actions' }, unlock, reset),
    h('p', { class: 'fine', text: '⚠️ Cette page révèle les scores cachés. Ne la montre pas à Oana !' }),
    h('div', { class: 'admin__grid' },
      h('div', { class: 'panel' }, h('h2', { class: 'panel__h', text: 'Scores cachés (réponses révélées ou non)' }),
        h('table', { class: 'tbl' }, h('tbody', {}, scores.map(([a, s]) => {
          const car = Object.entries(c.carMap).find(([, x]) => x === a)?.[0];
          return h('tr', { class: c.winner?.activity === a ? 'is-win' : '' }, h('td', { text: ACT[a] }), h('td', { text: `#${car?.slice(1)}` }), h('td', { class: 'num', text: s }));
        })))),
      h('div', { class: 'panel' }, h('h2', { class: 'panel__h', text: 'Réponses d’Oana' }),
        h('ol', { class: 'answers' }, c.answers.map((a) => h('li', {}, h('b', { text: a.question }), h('br'), h('span', { text: a.answer ?? '—' }))))),
      h('div', { class: 'panel' }, h('h2', { class: 'panel__h', text: `Invités (${c.guests.length})` }),
        h('table', { class: 'tbl' }, h('tbody', {}, c.guests.map((g) => {
          const kick = h('button', { class: 'link-btn', type: 'button', text: 'retirer' });
          action(kick, async () => { if (await confirmModal({ title: 'Retirer ce joueur ?', text: g.name, ok: 'Retirer', danger: true })) { await api('admin/kick', { gid: g.gid }); load(); } });
          return h('tr', {}, h('td', { text: `${g.rank}. ${g.name}` }), h('td', { text: g.bet ? `#${g.bet.slice(1)}` : '—' }), h('td', { class: 'num', text: fmt(g.points) }), h('td', {}, kick));
        })))),
      h('div', { class: 'panel' }, h('h2', { class: 'panel__h', text: 'Parties archivées' }),
        runs.length ? h('ul', { class: 'answers' }, runs.map((r) => h('li', {},
          h('b', { text: `${r.runId} — ${r.phase}` }), h('br'),
          h('span', { text: r.winner ? `Match : ${ACT[r.winner.activity]}` : 'Pas terminée' }), h('br'),
          h('small', { text: r.answers.map((a, i) => `${i + 1}. ${a.answer ?? '—'}`).join(' · ') }))))
          : h('p', { class: 'fine', text: 'Aucune pour l’instant.' })))));
}

load();
