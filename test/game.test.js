'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/game');
const { QUESTIONS, ACTIVITY_IDS, ACTIVITIES } = require('../server/content');

const A = ACTIVITY_IDS;

function playTo(s, answers, t0 = 1000) {
  let now = t0;
  game.actions.start(s, now, () => 0);
  game.actions.go(s, (now = s.lightsOutAt + 1400));
  for (let i = 0; i < answers.length; i++) {
    game.actions.oanaAnswer(s, (now += 1000), answers[i]);
    game.actions.reveal(s, (now += 1000));
    game.actions.next(s, (now += 1000));
  }
  return now;
}

test('neutralité : chaque activité gagne 20 % ± 1 sur toutes les combinaisons', () => {
  const K = A.length;
  const W = QUESTIONS.map((q) => q.options.map((o) => A.map((a) => o.w[a] || 0)));
  const win = new Float64Array(K);
  const N = 4 ** QUESTIONS.length;
  const sc = new Int32Array(K);
  for (let n = 0; n < N; n++) {
    sc.fill(0);
    let m = n;
    for (let q = 0; q < QUESTIONS.length; q++) { const o = W[q][m & 3]; m >>= 2; for (let a = 0; a < K; a++) sc[a] += o[a]; }
    let mx = -1; let c = 0;
    for (let a = 0; a < K; a++) { if (sc[a] > mx) { mx = sc[a]; c = 1; } else if (sc[a] === mx) c++; }
    for (let a = 0; a < K; a++) if (sc[a] === mx) win[a] += 1 / c;
  }
  for (let a = 0; a < K; a++) {
    const pct = (100 * win[a]) / N;
    assert.ok(Math.abs(pct - 20) <= 1, `${A[a]} gagne ${pct.toFixed(2)} %`);
  }
});

test('chaque réponse distribue 5 points et chaque activité peut gagner seule', () => {
  for (const q of QUESTIONS) for (const o of q.options) {
    assert.equal(Object.values(o.w).reduce((x, y) => x + y, 0), 5);
    for (const a of Object.keys(o.w)) assert.ok(A.includes(a));
  }
  for (const target of A) {
    const answers = QUESTIONS.map((q) => {
      let best = 0; let bestK = -Infinity;
      q.options.forEach((o, i) => {
        const k = (o.w[target] || 0) * 10 - Math.max(0, ...A.filter((x) => x !== target).map((x) => o.w[x] || 0));
        if (k > bestK) { bestK = k; best = i; }
      });
      return best;
    });
    const s = game.newState(0);
    playTo(s, answers);
    assert.equal(s.phase, 'match', `pas de gagnant unique pour ${target}`);
    assert.equal(s.carMap[s.winner], target);
  }
});

test('aucun prix nulle part dans le contenu', () => {
  const txt = JSON.stringify({ QUESTIONS, ACTIVITIES });
  assert.doesNotMatch(txt, /€|\beuros?\b|\btarifs?\b|(?<!grand )\bprix\b/i);
});

test('les vues navigateur ne divulguent ni poids, ni activités avant le match', () => {
  const s = game.newState(0);
  const gid = game.actions.guestJoin(s, 0, 'Ana', 'h');
  game.actions.guestBet(s, 0, gid, 'c7');
  const live = { connectedGuests: 1, oanaOnline: true };
  const check = () => {
    for (const who of [{ role: 'oana' }, { role: 'guest', gid }, { role: 'anon' }]) {
      const txt = JSON.stringify(game.view(s, who, live, 0));
      if (s.phase === 'match' || s.phase === 'podium') continue;
      for (const a of A) {
        assert.doesNotMatch(txt, new RegExp(`"${a}"`), `id ${a} en phase ${s.phase}`);
        assert.ok(!txt.includes(ACTIVITIES[a].name), `nom ${a} en phase ${s.phase}`);
        assert.ok(!txt.includes(ACTIVITIES[a].place), `lieu ${a} en phase ${s.phase}`);
      }
      assert.ok(!txt.includes('carMap') && !txt.includes('"w"') && !txt.includes('sid'), `secret en phase ${s.phase}`);
    }
  };
  check();
  let now = 10;
  game.actions.start(s, now, () => 0); check();
  game.actions.go(s, (now = s.lightsOutAt + 1400)); check();
  for (let i = 0; i < QUESTIONS.length; i++) {
    // l'invité ne doit pas voir la réponse d'Oana avant la révélation
    game.actions.oanaAnswer(s, ++now, 1);
    const gv = game.view(s, { role: 'guest', gid }, live, now);
    assert.equal(gv.oanaAnswer, undefined);
    assert.equal(gv.distribution, undefined);
    check();
    game.actions.guestAnswer(s, ++now, gid, 1);
    game.actions.reveal(s, ++now); check();
    game.actions.next(s, ++now); check();
  }
});

test('points invités : rapidité, question 7 doublée, bonus de pari', () => {
  assert.equal(game.answerPoints(0, 0), 1000);
  assert.equal(game.answerPoints(0, 20000), 500);
  assert.equal(game.answerPoints(0, 60000), 500);
  assert.equal(game.answerPoints(6, 0), 2000, 'Q7 doublée');
  const s = game.newState(0);
  const g1 = game.actions.guestJoin(s, 0, 'Rapide', 'a');
  const g2 = game.actions.guestJoin(s, 0, 'Lent', 'b');
  let now = 0;
  game.actions.start(s, now, () => 0);
  game.actions.go(s, (now = s.lightsOutAt + 1400));
  game.actions.guestAnswer(s, now + 0, g1, 2);
  game.actions.guestAnswer(s, now + 10000, g2, 2);
  game.actions.oanaAnswer(s, now + 11000, 2);
  // avant révélation : 0 point
  assert.equal(game.leaderboard(s)[0].points, 0);
  game.actions.reveal(s, now + 12000);
  const lb = game.leaderboard(s);
  assert.equal(lb[0].name, 'Rapide'); assert.equal(lb[0].points, 1000);
  assert.equal(lb[1].points, 750);
  assert.throws(() => game.actions.guestAnswer(s, now, g1, 1), /Trop tard/);
});

test('retour arrière : la réponse modifiée recalcule voitures et points', () => {
  const s = game.newState(0);
  const g = game.actions.guestJoin(s, 0, 'Ana', 'h');
  let now = 0;
  game.actions.start(s, now, () => 0);
  game.actions.go(s, (now = s.lightsOutAt + 1400));
  game.actions.guestAnswer(s, now + 100, g, 0);
  game.actions.oanaAnswer(s, now + 200, 0);
  game.actions.reveal(s, now + 300);
  assert.ok(game.leaderboard(s)[0].points > 0);
  const before = game.activityScores(s);
  game.actions.back(s, now + 400);
  assert.equal(s.phase, 'question'); assert.equal(s.q, 0);
  game.actions.oanaAnswer(s, now + 500, 1);
  game.actions.reveal(s, now + 600);
  assert.equal(game.leaderboard(s)[0].points, 0, 'le pronostic ne correspond plus');
  assert.notDeepEqual(game.activityScores(s), before);
  game.actions.next(s, now + 700);
  game.actions.back(s, now + 800);
  assert.equal(s.q, 0);
  assert.throws(() => game.actions.back(s, now + 900), /première question/);
});

test('égalité : Oana tranche, le public vote à titre indicatif', () => {
  // Cherche une combinaison qui donne une égalité.
  let answers = null;
  for (let n = 0; n < 4 ** 10 && !answers; n++) {
    const a = []; let m = n;
    for (let i = 0; i < 10; i++) { a.push(m & 3); m >>= 2; }
    const sc = Object.fromEntries(A.map((x) => [x, 0]));
    a.forEach((o, i) => { for (const [k, v] of Object.entries(QUESTIONS[i].options[o].w)) sc[k] += v; });
    const mx = Math.max(...Object.values(sc));
    if (Object.values(sc).filter((v) => v === mx).length === 2) answers = a;
  }
  const s = game.newState(0);
  const g = game.actions.guestJoin(s, 0, 'Ana', 'h');
  game.actions.guestBet(s, 0, g, 'c7');
  playTo(s, answers);
  assert.equal(s.phase, 'tiebreak');
  assert.equal(s.tie.cars.length, 2);
  game.actions.guestVote(s, 0, g, s.tie.cars[1]);
  const v = game.view(s, { role: 'oana' }, { connectedGuests: 1, oanaOnline: true }, 0);
  assert.equal(v.tie.votes[s.tie.cars[1]], 1);
  game.actions.tiePick(s, 0, s.tie.cars[0]);
  assert.equal(s.phase, 'match');
  assert.equal(s.winner, s.tie.cars[0]);
  assert.equal(game.view(s, { role: 'oana' }, { connectedGuests: 0, oanaOnline: true }, 0).match.compat, 100);
});

test('pari gagnant = +2777, paris fermés après le départ', () => {
  const s = game.newState(0);
  const g = game.actions.guestJoin(s, 0, 'Ana', 'h');
  // on parie sur la voiture qui portera l'activité visée « gt »
  const car = Object.keys(s.carMap).find((c) => s.carMap[c] === 'gt');
  game.actions.guestBet(s, 0, g, car);
  const answers = [0, 0, 0, 3, 0, 0, 3, 1, 1, 2];
  playTo(s, answers);
  assert.equal(s.carMap[s.winner], 'gt');
  const lb = game.leaderboard(s);
  assert.equal(lb[0].betWon, true);
  assert.equal(lb[0].points, game.BET_BONUS);
  assert.throws(() => game.actions.guestBet(s, 0, g, car), /fermés/);
});

test('pseudos nettoyés et dédoublonnés', () => {
  const s = game.newState(0);
  const a = game.actions.guestJoin(s, 0, '  <b>Max</b>‮  ', 'h1');
  const b = game.actions.guestJoin(s, 0, '<b>max</b>', 'h2');
  assert.equal(s.guests[a].name, '<b>Max</b>');
  assert.equal(s.guests[b].name, '<b>max</b> 2');
  assert.throws(() => game.actions.guestJoin(s, 0, '   ', 'h3'), /pseudo/);
  assert.equal(game.cleanName('x'.repeat(50)).length, 18);
});

test('rejouer garde les invités mais efface paris et réponses', () => {
  const s = game.newState(0);
  const g = game.actions.guestJoin(s, 0, 'Ana', 'h');
  game.actions.guestBet(s, 0, g, 'c7');
  s.oanaSid = 'x';
  const s2 = game.newState(1, s);
  assert.equal(s2.guests[g].name, 'Ana');
  assert.equal(s2.guests[g].bet, null);
  assert.equal(s2.oanaSid, 'x');
  assert.equal(s2.phase, 'lobby');
});
