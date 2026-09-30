/* Écrans partagés Oana / invités : départ, photo-finish, match, podium. */
import { h, api, action, serverNow, fmt, buzz, confirmModal } from './core.js';
import { createLights, carBadge, confetti } from './circuit.js';

export const FINALE_MS = 8200;
const carById = (v, id) => v.cars.find((c) => c.id === id);

/* ---------------- Départ ---------------- */
export const startScreen = {
  key: (v) => `start-${v.phaseAt}`,
  enter: 'zoom',
  mount(v) {
    const lights = createLights();
    const go = h('div', { class: 'go display', text: 'Hai să mergem !' });
    const el = h('section', { class: 'start' },
      h('p', { class: 'eyebrow', text: 'Formation lap terminé' }),
      lights.el,
      h('p', { class: 'start__hint', text: 'Les voitures sont en place. Le cœur d’Oana aussi.' }),
      go);
    lights.run(v.phaseAt, v.lightsOutAt, serverNow, () => { el.classList.add('is-go'); buzz([40, 30, 80]); });
    return el;
  },
};

/* ---------------- Photo-finish (égalité) ---------------- */
export function tieScreen(role) {
  return {
    key: (v) => `tie-${v.phaseAt}`,
    enter: 'zoom',
    mount(v) {
      const cards = v.tie.cars.map((id) => {
        const car = carById(v, id);
        const bar = h('i', { class: 'vote__fill' });
        const pct = h('span', { class: 'vote__pct' });
        const btn = h('button', { class: `btn ${role === 'oana' ? 'btn--love' : 'btn--ghost'} btn--block`, type: 'button', text: role === 'oana' ? 'C’est elle ! 💘' : 'Je vote pour elle' });
        if (role === 'oana') {
          action(btn, async () => {
            const ok = await confirmModal({ title: 'Ton choix est définitif', text: `Tu choisis la voiture #${car.num} comme match ?`, ok: 'Oui, c’est mon match' });
            if (ok) await api('oana/tiepick', { car: id });
          });
        } else {
          action(btn, () => api('guest/vote', { car: id }).then(() => buzz()));
        }
        return h('article', { class: 'tie-card', dataset: { car: id } },
          carBadge(car, { size: 'lg' }),
          h('p', { class: 'tie-card__bio', text: `« ${v.tie.bios[id]} »` }),
          h('div', { class: 'vote' }, h('span', { class: 'vote__label', text: 'Le public' }), h('div', { class: 'vote__bar' }, bar), pct),
          btn);
      });
      return h('section', { class: 'tie' },
        h('p', { class: 'eyebrow', text: 'Égalité parfaite sur la ligne' }),
        h('h2', { class: 'title display', text: 'Photo-finish !' }),
        h('p', { class: 'lead', text: role === 'oana'
          ? 'Impossible de les départager. Lis leurs profils, écoute le public… et choisis ton match.'
          : 'Oana va trancher. Vote pour l’aider (ou l’influencer 😏).' }),
        h('div', { class: 'tie__cards' }, cards));
    },
    update(el, v) {
      const total = Object.values(v.tie.votes).reduce((a, b) => a + b, 0);
      for (const card of el.querySelectorAll('.tie-card')) {
        const id = card.dataset.car; const n = v.tie.votes[id] || 0;
        const p = total ? Math.round((100 * n) / total) : 0;
        card.querySelector('.vote__fill').style.width = `${p}%`;
        card.querySelector('.vote__pct').textContent = `${p} %`;
        card.classList.toggle('is-mine', v.myVote === id);
      }
    },
  };
}

/* ---------------- Match ---------------- */
function gallery(photos, fallbackCar) {
  const track = h('div', { class: 'gallery__track' });
  const dots = h('div', { class: 'gallery__dots' });
  let ok = 0;
  photos.forEach((src, i) => {
    const img = h('img', { src, alt: '', loading: i ? 'lazy' : 'eager', decoding: 'async', draggable: 'false' });
    const slide = h('div', { class: 'gallery__slide' }, img);
    const dot = h('i');
    img.addEventListener('load', () => { ok++; wrap.classList.add('has-photos'); });
    img.addEventListener('error', () => { slide.remove(); dot.remove(); if (!track.children.length) wrap.classList.remove('has-photos'); });
    track.append(slide); dots.append(dot);
  });
  track.addEventListener('scroll', () => {
    const i = Math.round(track.scrollLeft / track.clientWidth);
    [...dots.children].forEach((d, k) => d.classList.toggle('is-on', k === i));
  }, { passive: true });
  dots.firstChild?.classList.add('is-on');
  const art = h('div', { class: 'gallery__art', 'aria-hidden': 'true' }, carBadge(fallbackCar, { size: 'xl' }));
  const wrap = h('div', { class: 'gallery' }, art, track, dots);
  return wrap;
}

export function matchCard(v) {
  const m = v.match;
  const car = carById(v, m.car);
  return h('article', { class: 'profile' },
    h('div', { class: 'profile__media' },
      gallery(m.photos, car),
      h('div', { class: 'profile__overlay' },
        h('span', { class: 'chip chip--glass', text: `Voiture #${car.num}` }),
        h('h3', { class: 'profile__name display', text: m.name }),
        h('p', { class: 'profile__place', text: `📍 ${m.place}` }))),
    h('div', { class: 'profile__body' },
      h('p', { class: 'profile__tagline', text: m.tagline }),
      h('ul', { class: 'chips' }, m.facts.map((f) => h('li', { class: 'chip', text: f }))),
      h('blockquote', { class: 'profile__bio' }, h('span', { class: 'eyebrow', text: 'Sa bio' }), h('p', { text: m.bio })),
      h('h4', { class: 'profile__h', text: 'Votre premier rendez-vous' }),
      m.description.map((p) => h('p', { class: 'profile__p', text: p }))));
}

function countUp(el, to, ms = 1400) {
  const t0 = performance.now();
  const loop = () => {
    const t = Math.min(1, (performance.now() - t0) / ms);
    el.textContent = `${Math.round(to * (1 - (1 - t) ** 3))} %`;
    if (t < 1) requestAnimationFrame(loop);
  };
  loop();
}

/**
 * @param role 'oana' | 'guest'
 * @param ctx  { circuit, dock, extras(v) → Element[] }
 */
export function matchScreen(role, ctx) {
  const timers = [];
  return {
    key: (v) => `match-${v.phaseAt}`,
    enter: 'fade',
    mount(v) {
      const m = v.match;
      const car = carById(v, m.car);
      const elapsed = serverNow() - v.phaseAt;
      const fresh = elapsed < FINALE_MS;
      const compat = h('span', { class: 'match__compat-n', text: fresh ? '0 %' : `${m.compat} %` });
      const hero = h('div', { class: 'match__hero' },
        h('p', { class: 'match__its display', text: 'It’s a' }),
        h('h2', { class: 'match__title display', text: 'Match!' }),
        h('p', { class: 'match__ro', text: 'Potrivire perfectă' }),
        h('div', { class: 'match__pair' },
          h('div', { class: 'avatar avatar--oana' }, h('span', { text: 'Oana' })),
          h('div', { class: 'match__heart', 'aria-hidden': 'true', text: '❤' }),
          h('div', { class: 'avatar avatar--car' }, carBadge(car, { size: 'md' }))),
        h('p', { class: 'match__compat' }, compat, h('span', { text: ' compatibles' })));
      const bday = h('aside', { class: 'bday' },
        h('p', { class: 'bday__title display', text: m.birthday.title }),
        h('p', { class: 'bday__text', text: m.birthday.text }));
      const body = h('div', { class: 'match__body' }, matchCard(v), bday, ...(ctx.extras?.(v) || []));
      const finish = h('div', { class: 'finish' },
        h('div', { class: 'finish__flag', 'aria-hidden': 'true' }),
        h('p', { class: 'finish__text display', text: 'Drapeau à damier !' }));
      const el = h('section', { class: `match ${fresh ? 'is-finale' : 'is-done'}` }, finish, hero, body);

      if (fresh) {
        // Séquence synchronisée sur l'horloge serveur : tous les téléphones vivent le même moment.
        const at = (t, fn) => timers.push(setTimeout(fn, Math.max(0, t - (serverNow() - v.phaseAt))));
        ctx.dock.classList.add('is-hero');
        ctx.circuit.highlight(m.car);
        at(3300, () => { el.classList.add('is-flag'); buzz([60, 40, 60]); });
        at(4700, () => { el.classList.add('is-match'); ctx.dock.classList.remove('is-hero'); confetti(); countUp(compat, m.compat); buzz([30, 30, 30, 30, 200]); });
        at(7600, () => { el.classList.add('is-body'); });
      } else {
        el.classList.add('is-match', 'is-body');
        ctx.circuit.highlight(m.car);
      }
      return el;
    },
    update(el, v) { ctx.update?.(el, v); },
  };
}

/* ---------------- Podium ---------------- */
export function podiumScreen(role, extras) {
  return {
    key: (v) => `podium-${v.phaseAt}`,
    enter: 'zoom',
    mount(v) {
      const p = v.podium || [];
      const step = (r, cls) => r ? h('div', { class: `podium__step ${cls}` },
        h('span', { class: 'podium__name', text: r.name }),
        h('span', { class: 'podium__pts', text: `${fmt(r.points)} pts` }),
        h('div', { class: 'podium__block' }, h('span', { class: 'display', text: String(r.rank) }))) : h('div', { class: `podium__step ${cls} is-empty` });
      const rest = p.slice(3).map((r) => h('li', {}, h('span', { class: 'rest__rank', text: `${r.rank}` }), h('span', { class: 'rest__name', text: r.name }), h('span', { class: 'rest__pts', text: `${fmt(r.points)} pts` })));
      const winners = v.betWinners || [];
      setTimeout(() => confetti({ count: 90 }), 900);
      return h('section', { class: 'podium-screen' },
        h('p', { class: 'eyebrow', text: 'Classement des amis' }),
        h('h2', { class: 'title display', text: 'Le podium' }),
        p.length ? h('div', { class: 'podium' }, step(p[1], 'is-2'), step(p[0], 'is-1'), step(p[2], 'is-3'))
          : h('p', { class: 'lead', text: 'Personne n’a joué cette fois-ci… Oana gagne par forfait 😄' }),
        rest.length ? h('ol', { class: 'rest' }, rest) : null,
        h('p', { class: 'podium__bets' }, winners.length
          ? `🎟 Pari gagnant sur la voiture #${carById(v, v.match.car).num} : ${winners.join(', ')} (+2 777 pts)`
          : `🎟 Personne n’avait parié sur la voiture #${carById(v, v.match.car).num} !`),
        ...(extras?.(v) || []));
    },
  };
}
