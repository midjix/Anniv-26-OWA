'use strict';
/*
 * Machine d'état du jeu. Aucune I/O ici : tout est déterministe et testable.
 *
 * Phases :
 *   lobby → start (feux F1) → question ⇄ reveal (×10) → [tiebreak] → match → podium
 *
 * Tout ce qui est « score » est DÉRIVÉ des réponses stockées : revenir en
 * arrière et changer une réponse recalcule automatiquement voitures et points.
 */
const crypto = require('node:crypto');
const { ACTIVITIES, ACTIVITY_IDS, QUESTIONS, BIRTHDAY } = require('./content');

const NB_Q = QUESTIONS.length;
const LUCKY_MULT = 2;
const BET_BONUS = 2777;
const MAX_POINTS = 1000;
const MIN_POINTS = 500;
const SPEED_WINDOW_MS = 20000;
const MAX_GUESTS = 80;

// Voitures anonymes : l'association voiture → activité est tirée au sort
// à chaque partie et ne quitte jamais le serveur.
const CARS = [
  { id: 'c7', num: 7, color: '#E10600', trim: '#FFFFFF' },
  { id: 'c1', num: 1, color: '#F4F1EA', trim: '#E10600' },
  { id: 'c16', num: 16, color: '#FFC21A', trim: '#161616' },
  { id: 'c44', num: 44, color: '#1B1B1F', trim: '#00D7B6' },
  { id: 'c81', num: 81, color: '#FF7A1A', trim: '#1B1B1F' },
];
const CAR_IDS = CARS.map((c) => c.id);

class GameError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const rid = (n = 9) => crypto.randomBytes(n).toString('base64url');

function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newState(now = Date.now(), prev = null) {
  const acts = shuffle(ACTIVITY_IDS);
  const carMap = {};
  CAR_IDS.forEach((c, i) => { carMap[c] = acts[i]; });
  const guests = {};
  // « Rejouer » : on garde les invités (et leurs sessions), on remet tout à zéro.
  if (prev) {
    for (const [gid, g] of Object.entries(prev.guests)) {
      guests[gid] = { name: g.name, sid: g.sid, joinedAt: g.joinedAt, bet: null, ans: {} };
    }
  }
  return {
    v: 1,
    runId: `${new Date(now).toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${rid(3)}`,
    createdAt: now,
    phase: 'lobby',
    phaseAt: now,
    q: 0,
    lightsOutAt: null,
    carMap,
    oanaSid: prev ? prev.oanaSid : null,
    answers: Array(NB_Q).fill(null),
    qOpenedAt: Array(NB_Q).fill(null),
    guests,
    tie: null,
    winner: null,
    tiePicked: false,
  };
}

/* ------------------------------------------------------------------ */
/* Scores dérivés                                                       */
/* ------------------------------------------------------------------ */

/** Nombre de questions dont la réponse d'Oana a été révélée. */
function revealedCount(s) {
  if (s.phase === 'lobby' || s.phase === 'start') return 0;
  if (s.phase === 'question') return s.q;
  if (s.phase === 'reveal') return s.q + 1;
  return NB_Q;
}

function activityScores(s, upto = revealedCount(s)) {
  const sc = Object.fromEntries(ACTIVITY_IDS.map((a) => [a, 0]));
  for (let i = 0; i < upto; i++) {
    const o = s.answers[i];
    if (o == null) continue;
    for (const [a, v] of Object.entries(QUESTIONS[i].options[o].w)) sc[a] += v;
  }
  return sc;
}

function carScores(s, upto) {
  const act = activityScores(s, upto);
  return Object.fromEntries(CAR_IDS.map((c) => [c, act[s.carMap[c]]]));
}

/** Position de chaque voiture sur le tour (0 → 1 = ligne d'arrivée). */
function carProgress(s) {
  const rc = revealedCount(s);
  const sc = carScores(s, rc);
  const max = Math.max(...Object.values(sc));
  const base = (rc / NB_Q) * 0.9;
  const out = {};
  for (const c of CAR_IDS) {
    const rel = max > 0 ? sc[c] / max : 1;
    out[c] = +(base * (0.74 + 0.26 * rel)).toFixed(4);
  }
  if (s.phase === 'tiebreak' && s.tie) {
    for (const c of s.tie.cars) out[c] = 0.965;
  }
  if ((s.phase === 'match' || s.phase === 'podium') && s.winner) out[s.winner] = 1;
  return out;
}

/** Classement 1..n des voitures (ex-æquo = même rang). */
function carRanks(s) {
  const sc = carScores(s, revealedCount(s));
  const sorted = CAR_IDS.slice().sort((a, b) => sc[b] - sc[a]);
  const ranks = {};
  sorted.forEach((c, i) => {
    ranks[c] = i > 0 && sc[c] === sc[sorted[i - 1]] ? ranks[sorted[i - 1]] : i + 1;
  });
  if (s.winner && (s.phase === 'match' || s.phase === 'podium')) {
    for (const c of CAR_IDS) if (c !== s.winner && ranks[c] === 1) ranks[c] = 2;
    ranks[s.winner] = 1;
  }
  return ranks;
}

function answerPoints(qi, ms) {
  const t = Math.min(Math.max(ms, 0), SPEED_WINDOW_MS) / SPEED_WINDOW_MS;
  const pts = Math.round(MAX_POINTS - (MAX_POINTS - MIN_POINTS) * t);
  return QUESTIONS[qi].lucky ? pts * LUCKY_MULT : pts;
}

/** Points gagnés par un invité sur la question qi (0 si pas révélée/faux). */
function guestQuestionPoints(s, g, qi) {
  if (qi >= revealedCount(s)) return 0;
  const a = g.ans[qi];
  if (!a || s.answers[qi] == null || a.o !== s.answers[qi]) return 0;
  return answerPoints(qi, a.ms);
}

function guestPoints(s, g) {
  let p = 0;
  for (let i = 0; i < NB_Q; i++) p += guestQuestionPoints(s, g, i);
  const betWon = !!(s.winner && g.bet === s.winner && (s.phase === 'match' || s.phase === 'podium'));
  if (betWon) p += BET_BONUS;
  return { points: p, betWon };
}

function leaderboard(s) {
  return Object.entries(s.guests)
    .map(([gid, g]) => ({ gid, name: g.name, ...guestPoints(s, g) }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'fr'))
    .map((r, i, arr) => ({ ...r, rank: i > 0 && r.points === arr[i - 1].points ? null : i + 1 }))
    .map((r, i, arr) => {
      if (r.rank == null) { let j = i; while (arr[j].rank == null) j--; r.rank = arr[j].rank; }
      return r;
    });
}

/* ------------------------------------------------------------------ */
/* Transitions                                                          */
/* ------------------------------------------------------------------ */

function must(cond, code, msg, status) { if (!cond) throw new GameError(code, msg, status); }

function setPhase(s, phase, now) { s.phase = phase; s.phaseAt = now; }

function openQuestion(s, qi, now) {
  s.q = qi;
  s.qOpenedAt[qi] = now;
  setPhase(s, 'question', now);
}

const actions = {
  start(s, now, rnd = Math.random) {
    must(s.phase === 'lobby', 'bad_phase', 'La course a déjà commencé.');
    setPhase(s, 'start', now);
    // 5 feux (1 s chacun) puis extinction aléatoire, comme en F1.
    s.lightsOutAt = now + 5000 + 700 + Math.floor(rnd() * 1600);
  },

  /** Appelé par le minuteur serveur une fois les feux éteints. */
  go(s, now) {
    if (s.phase !== 'start') return false;
    openQuestion(s, 0, now);
    return true;
  },

  oanaAnswer(s, now, o) {
    must(s.phase === 'question', 'bad_phase', 'Pas de question en cours.');
    must(Number.isInteger(o) && o >= 0 && o < QUESTIONS[s.q].options.length, 'bad_input', 'Réponse invalide.', 400);
    s.answers[s.q] = o;
  },

  reveal(s, now) {
    must(s.phase === 'question', 'bad_phase', 'Pas de question en cours.');
    must(s.answers[s.q] != null, 'no_answer', 'Choisis d’abord ta réponse.');
    setPhase(s, 'reveal', now);
  },

  next(s, now) {
    must(s.phase === 'reveal', 'bad_phase', 'Révèle d’abord ta réponse.');
    if (s.q < NB_Q - 1) return openQuestion(s, s.q + 1, now);
    // Ligne d'arrivée
    const sc = carScores(s, NB_Q);
    const max = Math.max(...Object.values(sc));
    const top = CAR_IDS.filter((c) => sc[c] === max);
    if (top.length === 1) {
      s.winner = top[0];
      s.tiePicked = false;
      setPhase(s, 'match', now);
    } else {
      s.tie = { cars: top, votes: {} };
      setPhase(s, 'tiebreak', now);
    }
  },

  back(s, now) {
    must(s.phase === 'question' || s.phase === 'reveal' || s.phase === 'tiebreak', 'bad_phase', 'Impossible de revenir en arrière maintenant.');
    if (s.phase === 'tiebreak') { s.tie = null; s.q = NB_Q - 1; setPhase(s, 'reveal', now); return; }
    if (s.phase === 'reveal') return openQuestion(s, s.q, now);
    must(s.q > 0, 'first', 'Tu es déjà à la première question.');
    return openQuestion(s, s.q - 1, now);
  },

  tiePick(s, now, car) {
    must(s.phase === 'tiebreak' && s.tie, 'bad_phase', 'Pas d’égalité en cours.');
    must(s.tie.cars.includes(car), 'bad_input', 'Voiture invalide.', 400);
    s.winner = car;
    s.tiePicked = true;
    setPhase(s, 'match', now);
  },

  podium(s, now) {
    must(s.phase === 'match', 'bad_phase', 'Le match n’a pas encore eu lieu.');
    setPhase(s, 'podium', now);
  },

  guestJoin(s, now, name, sid) {
    must(s.phase !== 'podium', 'closed', 'La partie est terminée 🏁');
    must(Object.keys(s.guests).length < MAX_GUESTS, 'full', 'La grille de départ est complète !');
    const clean = cleanName(name);
    must(clean.length >= 1, 'bad_input', 'Choisis un pseudo.', 400);
    let final = clean;
    const taken = new Set(Object.values(s.guests).map((g) => g.name.toLowerCase()));
    for (let i = 2; taken.has(final.toLowerCase()); i++) final = `${clean.slice(0, 15)} ${i}`;
    const gid = rid(6);
    s.guests[gid] = { name: final, sid, joinedAt: now, bet: null, ans: {} };
    return gid;
  },

  guestBet(s, now, gid, car) {
    const g = s.guests[gid];
    must(g, 'unknown', 'Invité inconnu.', 403);
    must(s.phase === 'lobby', 'bad_phase', 'Les paris sont fermés, la course est lancée !');
    must(CAR_IDS.includes(car), 'bad_input', 'Voiture invalide.', 400);
    g.bet = car;
  },

  guestAnswer(s, now, gid, o) {
    const g = s.guests[gid];
    must(g, 'unknown', 'Invité inconnu.', 403);
    must(s.phase === 'question', 'bad_phase', 'Trop tard pour cette question !');
    must(Number.isInteger(o) && o >= 0 && o < QUESTIONS[s.q].options.length, 'bad_input', 'Réponse invalide.', 400);
    must(!g.ans[s.q], 'already', 'Réponse déjà verrouillée.');
    g.ans[s.q] = { o, ms: Math.max(0, now - s.qOpenedAt[s.q]) };
  },

  guestVote(s, now, gid, car) {
    must(s.guests[gid], 'unknown', 'Invité inconnu.', 403);
    must(s.phase === 'tiebreak' && s.tie, 'bad_phase', 'Pas de vote en cours.');
    must(s.tie.cars.includes(car), 'bad_input', 'Voiture invalide.', 400);
    s.tie.votes[gid] = car;
  },

  kick(s, now, gid) {
    must(s.guests[gid], 'unknown', 'Invité inconnu.', 404);
    delete s.guests[gid];
    if (s.tie) delete s.tie.votes[gid];
  },
};

function cleanName(name) {
  return String(name ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18);
}

/* ------------------------------------------------------------------ */
/* Vues envoyées aux navigateurs (jamais le state brut)                 */
/* ------------------------------------------------------------------ */

function questionView(qi) {
  const q = QUESTIONS[qi];
  return { n: qi + 1, text: q.text, lucky: !!q.lucky, options: q.options.map((o) => o.text) };
}

function distribution(s, qi) {
  const d = Array(QUESTIONS[qi].options.length).fill(0);
  for (const g of Object.values(s.guests)) if (g.ans[qi]) d[g.ans[qi].o]++;
  return d;
}

function compat(s) {
  if (!s.winner) return null;
  if (s.tiePicked) return 100;
  const sc = Object.values(carScores(s, NB_Q)).sort((a, b) => b - a);
  const margin = sc[0] > 0 ? (sc[0] - sc[1]) / sc[0] : 0;
  return Math.min(99, 91 + Math.round(margin * 20));
}

function matchView(s) {
  const a = ACTIVITIES[s.carMap[s.winner]];
  return {
    car: s.winner,
    compat: compat(s),
    name: a.name,
    tagline: a.tagline,
    place: a.place,
    bio: a.bio,
    description: a.description,
    facts: a.facts,
    photos: a.photos.map((p) => `/media/${p}.jpg`),
    birthday: BIRTHDAY,
  };
}

/**
 * @param {object} s  state
 * @param {{role:'oana'|'guest'|'admin'|'anon', gid?:string}} who
 * @param {{connectedGuests:number, oanaOnline:boolean}} live
 */
function view(s, who, live, now = Date.now()) {
  const v = {
    now,
    runId: s.runId,
    phase: s.phase,
    phaseAt: s.phaseAt,
    lightsOutAt: s.lightsOutAt,
    total: NB_Q,
    q: s.q,
    revealed: revealedCount(s),
    cars: CARS.map((c) => ({ ...c })),
    progress: carProgress(s),
    ranks: carRanks(s),
    counts: {
      guests: Object.keys(s.guests).length,
      connected: live.connectedGuests,
      bets: Object.values(s.guests).filter((g) => g.bet).length,
      answered: s.phase === 'question' || s.phase === 'reveal'
        ? Object.values(s.guests).filter((g) => g.ans[s.q]).length : 0,
    },
    oanaOnline: live.oanaOnline,
    role: who.role,
  };

  if (s.phase === 'question' || s.phase === 'reveal') v.question = questionView(s.q);
  if (s.phase === 'reveal') {
    v.oanaAnswer = s.answers[s.q];
    v.distribution = distribution(s, s.q);
  }
  if (s.phase === 'tiebreak' && s.tie) {
    const votes = Object.fromEntries(s.tie.cars.map((c) => [c, 0]));
    for (const c of Object.values(s.tie.votes)) votes[c]++;
    v.tie = {
      cars: s.tie.cars,
      votes,
      bios: Object.fromEntries(s.tie.cars.map((c) => [c, ACTIVITIES[s.carMap[c]].bio])),
    };
  }
  if (s.phase === 'match' || s.phase === 'podium') {
    v.match = matchView(s);
    v.betWinners = Object.values(s.guests).filter((g) => g.bet === s.winner).map((g) => g.name);
  }
  if (s.phase === 'podium') v.podium = leaderboard(s).slice(0, 10).map(({ name, points, rank }) => ({ name, points, rank }));

  if (who.role === 'oana') {
    v.me = { name: 'Oana' };
    if (s.phase === 'question') v.myAnswer = s.answers[s.q];
    v.canBack = (s.phase === 'question' && s.q > 0) || s.phase === 'reveal' || s.phase === 'tiebreak';
    v.guestNames = Object.values(s.guests).map((g) => g.name);
    if (s.phase === 'reveal') {
      v.rightGuesses = Object.values(s.guests).filter((g) => g.ans[s.q] && g.ans[s.q].o === s.answers[s.q]).length;
    }
  }

  if (who.role === 'guest' && s.guests[who.gid]) {
    const g = s.guests[who.gid];
    const lb = leaderboard(s);
    const mine = lb.find((r) => r.gid === who.gid);
    v.me = { name: g.name, bet: g.bet, points: mine.points, rank: mine.rank, betWon: mine.betWon, of: lb.length };
    if (s.phase === 'question' || s.phase === 'reveal') v.myAnswer = g.ans[s.q] || null;
    if (s.phase === 'reveal') v.gained = guestQuestionPoints(s, g, s.q);
    if (s.phase === 'tiebreak' && s.tie) v.myVote = s.tie.votes[who.gid] || null;
  }

  return v;
}

/** Vue complète pour la régie (contient les secrets : réservé à l'admin). */
function adminView(s, live) {
  return {
    runId: s.runId,
    phase: s.phase,
    q: s.q,
    oanaLocked: !!s.oanaSid,
    live,
    carMap: s.carMap,
    activityScores: activityScores(s, NB_Q),
    answers: s.answers.map((o, i) => ({
      question: QUESTIONS[i].text,
      answer: o == null ? null : QUESTIONS[i].options[o].text,
    })),
    winner: s.winner ? { car: s.winner, activity: s.carMap[s.winner] } : null,
    guests: leaderboard(s).map((r) => ({ ...r, bet: s.guests[r.gid].bet })),
  };
}

module.exports = {
  NB_Q, CARS, CAR_IDS, BET_BONUS, MAX_GUESTS, GameError,
  newState, actions, view, adminView, leaderboard,
  activityScores, carScores, carProgress, revealedCount, answerPoints, cleanName, rid,
};
