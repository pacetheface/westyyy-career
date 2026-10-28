// Replay Lab data engine: turns a parsed match into a neutral log of moments for every player,
// plus a set of numbers per player. No judgments here: a moment says what happened, with facts.
// Rules are deliberately simple and written out so they can be checked and improved; bump
// ENGINE_VERSION whenever a rule changes so stored games can be recalculated.

export const ENGINE_VERSION = 2;   // v2: kickoff goals

const GOAL_Y = 5120, THIRD = 1707, SUPERSONIC = 2200;
const KMH = 0.036;                         // uu/s (cm/s) -> km/h
const CHALLENGE_GAP = 0.4;                 // two touches by different teams this close = a 50/50
const CHALLENGE_NEAR = 300;                // or: opponent this close to the ball at the touch
const PAST_RANGE = 2500;                   // "ball got past" only counts if the player was in the play

export const MOMENT_TYPES = {
  goal: 'Goal', shot: 'Shot', save: 'Save', kickoff: 'Kickoff', challenge: '50/50',
  turnover: 'Turnover', clear: 'Clear', past: 'Ball got past', demo: 'Demo',
  doublecommit: 'Double commit', reset: 'Flip reset',
};

// [key, label, unit]  unit: '%' = share of active play time, 'n' = count, 'km/h', 'm', 'boost'
export const NUMBERS = [
  ['goals', 'Goals', 'n'], ['shots', 'Shots', 'n'], ['saves', 'Saves', 'n'], ['goalsAgainst', 'Goals against', 'n'],
  ['kickoffGoals', 'Kickoff goals', 'n'], ['kickoffGoalsAgainst', 'Kickoff goals against', 'n'],
  ['playSec', 'Active play', 's'],
  ['behindPct', 'Behind the ball', '%'], ['defPct', 'Own third', '%'], ['midPct', 'Middle third', '%'], ['attPct', 'Attacking third', '%'],
  ['lastManPct', 'Last back (team games)', '%'], ['avgDistBall', 'Avg distance to ball', 'm'],
  ['avgBoost', 'Avg boost', 'boost'], ['emptyBoostPct', 'Empty boost (0-5)', '%'], ['fullBoostPct', 'Full boost (95+)', '%'],
  ['bigPads', 'Big pads', 'n'], ['smallPads', 'Small pads', 'n'], ['bigPadWaste', 'Boost already held at big pads (avg)', 'boost'],
  ['avgSpeed', 'Avg speed', 'km/h'], ['supersonicPct', 'Supersonic', '%'], ['airPct', 'In the air', '%'],
  ['possessionPct', 'Team had the ball last', '%'], ['touches', 'Touches', 'n'], ['aerialTouches', 'Aerial touches', 'n'],
  ['challenges', '50/50s', 'n'], ['challengesWon', '50/50s won', 'n'], ['challengesLost', '50/50s lost', 'n'],
  ['kickoffs', 'Kickoffs', 'n'], ['kickoffsWon', 'Kickoffs won', 'n'], ['kickoffsLost', 'Kickoffs lost', 'n'],
  ['turnoversLost', 'Turnovers lost', 'n'], ['turnoversWon', 'Turnovers won', 'n'], ['clears', 'Clears', 'n'],
  ['ballPast', 'Ball got past him', 'n'], ['doubleCommits', 'Double commits', 'n'],
  ['demosGiven', 'Demos given', 'n'], ['demosTaken', 'Demos taken', 'n'], ['flipResets', 'Flip resets', 'n'],
];

const r1 = x => Math.round(x * 10) / 10;

export function buildData(M) {
  const T = M.t, N = T.length, P = M.players, B = M.ball, BV = M.ballVel || [];
  const dir = team => (team === 0 ? 1 : -1);                    // direction a team attacks in y
  const frameAt = tt => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const dt = i => (i < N - 1 ? T[i + 1] - T[i] : 0);
  const keyIdx = Object.fromEntries(P.map((p, k) => [p.key, k]));
  const nameIdx = Object.fromEntries(P.map((p, k) => [p.name, k]));
  const teamSize = Math.max(1, ...[0, 1].map(t => P.filter(p => p.team === t).length));

  // frames with the ball in play (not kickoff countdowns, not the seconds after a goal)
  const active = new Uint8Array(N); { let st = false; for (let i = 0; i < N; i++) { const b = B[i]; if (!b) { st = false; continue; } if (!st && (Math.abs(b[0]) > 5 || Math.abs(b[1]) > 5)) st = true; active[i] = st ? 1 : 0; } }

  const pos = (k, i) => P[k].track[i] || null;
  const spd = (k, i) => { const v = P[k].vel && P[k].vel[i]; return v ? Math.hypot(v[0], v[1], v[2]) : 0; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const goalSide = (k, i) => { const c = pos(k, i), b = B[i]; return !!(c && b && (c[1] - b[1]) * dir(P[k].team) < 0); };
  const airborne = c => c[2] > 250 && Math.abs(c[0]) < 3800 && Math.abs(c[1]) < 4900;
  const zoneOf = (y, team) => { const v = y * dir(team); return v < -THIRD ? 'own third' : v > THIRD ? 'attacking third' : 'middle third'; };
  const jumpedNear = (k, i) => { const a = P[k].act; if (!a) return false; for (let j = frameAt(T[i] - 1); j <= i; j++) if (a[j]) return true; return false; };
  const facts = (k, i) => {
    const c = pos(k, i), b = B[i]; if (!c) return null;
    return { boost: P[k].boost[i], kmh: Math.round(spd(k, i) * KMH), distBall: b ? Math.round(dist(c, b) / 100) : null,
      distGoal: Math.round(Math.hypot(c[0], c[1] + dir(P[k].team) * GOAL_Y) / 100), jumped: jumpedNear(k, i),
      air: airborne(c), goalSide: goalSide(k, i), zone: zoneOf(c[1], P[k].team) };
  };
  const ballFacts = i => { const b = B[i], v = BV[i]; return b ? { ballKmh: v ? Math.round(Math.hypot(v[0], v[1], v[2]) * KMH) : null, ballHeight: Math.round(b[2] / 100) } : {}; };
  const nearestOf = (team, i, exclude = -1) => { let best = -1, bd = 1e9; P.forEach((p, k) => { if (p.team !== team || k === exclude) return; const c = pos(k, i), b = B[i]; if (!c || !b) return; const d = dist(c, b); if (d < bd) { bd = d; best = k; } }); return [best, bd]; };
  const goals = M.moments.filter(m => m.type === 'goal');
  const teamName = team => P.filter(p => p.team === team).map(p => p.name).join(' + ') || (team === 0 ? 'Blue' : 'Orange');
  const gotIt = team => `${teamName(team)} got the ball`;
  const goalWithin = (i, s) => goals.find(g => g.f >= i && T[g.f] - T[i] <= s);

  const moments = [];
  const add = (type, i, k, extra = {}) => moments.push(Object.assign({ type, f: i, clock: M.clock[i], k, team: k >= 0 ? P[k].team : extra.team }, extra));

  // ---- touches, attributed to the nearest player of the touching team ----
  const touches = (M.touches || []).map(t => ({ ...t, k: nearestOf(t.team, t.f)[0] })).filter(t => t.k >= 0).sort((a, b) => a.f - b.f);

  // ---- kickoffs: first touch after the ball is reset to the centre ----
  const kickoffTouch = new Set();
  for (let i = 0; i < N; i++) {
    const b = B[i]; if (!b || Math.abs(b[0]) > 5 || Math.abs(b[1]) > 5) continue;
    if (i > 0 && B[i - 1] && Math.abs(B[i - 1][0]) <= 5 && Math.abs(B[i - 1][1]) <= 5) continue;   // only the first frame of the reset
    const first = touches.find(t => t.f >= i); if (!first) continue;
    if (kickoffTouch.has(first)) continue; kickoffTouch.add(first);
    const after = frameAt(T[first.f] + 3), g = goalWithin(first.f, 3), ba = B[after];
    let winner = null;
    if (g) winner = g.team; else if (ba) winner = ba[1] > 1000 ? 0 : ba[1] < -1000 ? 1 : null;
    const other = nearestOf(1 - first.team, first.f)[0];
    add('kickoff', first.f, first.k, { other, outcome: winner === null ? 'neutral' : gotIt(winner), winner,
      me: facts(first.k, first.f), them: other >= 0 ? facts(other, first.f) : null, ...ballFacts(first.f) });
  }

  // ---- 50/50s and turnovers from the touch sequence ----
  let lastChallengeT = -9;
  const inChallenge = new Set();
  const kickoffT = [...kickoffTouch].map(t => T[t.f]);
  const nearKickoff = a => kickoffT.some(kt => T[a.f] >= kt && T[a.f] - kt < 1.0);
  touches.forEach((a, n) => {
    if (kickoffTouch.has(a) || nearKickoff(a) || !active[a.f]) return;
    const b = touches[n + 1];
    const [opp, od] = nearestOf(1 - a.team, a.f);
    const paired = b && b.team !== a.team && T[b.f] - T[a.f] <= CHALLENGE_GAP;
    if ((paired || od < CHALLENGE_NEAR) && T[a.f] - lastChallengeT > 0.6 && opp >= 0) {
      lastChallengeT = T[a.f];
      const endT = paired ? T[b.f] : T[a.f];
      if (paired) inChallenge.add(b); inChallenge.add(a);
      const next = touches.find(t => T[t.f] > endT + CHALLENGE_GAP && T[t.f] - endT < 4);
      const g = goalWithin(a.f, 4);
      let winner = g ? g.team : next ? next.team : null;
      if (winner === null) { const j = frameAt(endT + 0.5), v = BV[j]; if (v) winner = v[1] > 300 ? 0 : v[1] < -300 ? 1 : null; }
      const k1 = a.k, k2 = paired ? b.k : opp;
      add('challenge', a.f, k1, { other: k2, winner, outcome: winner === null ? 'neutral' : gotIt(winner),
        me: facts(k1, a.f), them: facts(k2, a.f), both: paired, ...ballFacts(a.f) });
    }
  });
  touches.forEach((a, n) => {
    const b = touches[n + 1]; if (!b || b.team === a.team || inChallenge.has(a) || inChallenge.has(b) || kickoffTouch.has(b)) return;
    if (T[b.f] - T[a.f] <= CHALLENGE_GAP) return;
    let gap = false; for (let i = a.f; i <= b.f; i++) if (!B[i]) { gap = true; break; }
    if (gap) return;
    const bb = B[b.f];
    add('turnover', b.f, a.k, { other: b.k, outcome: `${P[b.k].name} got the ball`, zone: bb ? zoneOf(bb[1], P[a.k].team) : '', secs: r1(T[b.f] - T[a.f]),
      me: facts(a.k, b.f), them: facts(b.k, b.f), ...ballFacts(b.f) });
  });

  // ---- clears: a touch in your own third that gets the ball out of it ----
  const lastClear = {};
  touches.forEach(a => {
    const b = B[a.f]; if (!b || kickoffTouch.has(a) || !active[a.f]) return;
    if (b[1] * dir(a.team) >= -THIRD) return;
    if (T[a.f] - (lastClear[a.k] ?? -9) < 1.5) return; lastClear[a.k] = T[a.f];
    const j = frameAt(T[a.f] + 1.5), bj = B[j];
    if (bj && bj[1] * dir(a.team) > -THIRD) add('clear', a.f, a.k, { outcome: `ball out to the ${zoneOf(bj[1], a.team)}`, me: facts(a.k, a.f), ...ballFacts(a.f + 3 < N ? a.f + 3 : a.f) });
  });

  // ---- ball got past a defender: goal-side one frame, not the next, while the other team is attacking ----
  const lastTouchTeam = new Int8Array(N).fill(-1); { let tI = 0, cur = -1; for (let i = 0; i < N; i++) { while (tI < touches.length && touches[tI].f <= i) cur = touches[tI++].team; if (!B[i]) cur = -1; lastTouchTeam[i] = cur; } }
  P.forEach((p, k) => {
    let lastT = -9;
    for (let i = 1; i < N; i++) {
      if (!active[i] || !goalSide(k, i - 1) || goalSide(k, i)) continue;
      const c = pos(k, i), b = B[i], v = BV[i]; if (!c || !b) continue;
      const attacking = lastTouchTeam[i] === 1 - p.team || (v && v[1] * dir(p.team) < -500);
      if (!attacking || dist(c, b) > PAST_RANGE || T[i] - lastT < 3) continue;
      lastT = T[i];
      const g = goals.find(x => x.team !== p.team && x.f >= i && T[x.f] - T[i] <= 6);
      let outcome = 'play went on';
      if (g) outcome = 'goal against';
      else {
        const back = (() => { for (let j = i + 1; j < N && T[j] - T[i] <= 3; j++) if (goalSide(k, j)) return true; return false; })();
        const regain = touches.find(t => t.f > i && T[t.f] - T[i] <= 4);
        if (regain && regain.team === p.team) outcome = 'his team got the ball back';
        else if (back) outcome = 'got back goal-side within 3s';
      }
      add('past', i, k, { outcome, secsToGoal: g ? r1(T[g.f] - T[i]) : null, me: facts(k, i), ...ballFacts(i) });
    }
  });

  // ---- double commits (team games): two teammates closing on the ball at once ----
  if (teamSize > 1) [0, 1].forEach(team => {
    const mates = P.map((p, k) => p.team === team ? k : -1).filter(k => k >= 0);
    let lastT = -9;
    for (let i = 0; i < N; i += 6) {
      if (!active[i] || T[i] - lastT < 3) continue;
      const b = B[i]; if (!b) continue;
      const closing = mates.filter(k => { const c = pos(k, i), v = P[k].vel && P[k].vel[i]; if (!c || !v) return false; const d = dist(c, b); if (d > 600) return false; return (v[0] * (b[0] - c[0]) + v[1] * (b[1] - c[1]) + v[2] * (b[2] - c[2])) / Math.max(1, d) > 500; });
      if (closing.length < 2) continue;
      lastT = T[i];
      const next = touches.find(t => t.f > i && T[t.f] - T[i] <= 3), g = goals.find(x => x.team !== team && x.f >= i && T[x.f] - T[i] <= 6);
      add('doublecommit', i, closing[0], { other: closing[1], outcome: g ? 'goal against' : next ? gotIt(next.team) : 'no touch', me: facts(closing[0], i), them: facts(closing[1], i), ...ballFacts(i) });
    }
  });

  // ---- goals, shots, saves (from the game's own events) ----
  M.moments.forEach(m => {
    const k = nameIdx[m.player] ?? -1;
    const [def] = nearestOf(1 - m.team, m.f);
    add(m.type, m.f, k, { team: m.team, kmh: m.kmh || null, other: def, outcome: m.type === 'goal' ? 'scored' : m.type === 'save' ? 'saved' : 'on target',
      me: k >= 0 ? facts(k, m.f) : null, them: def >= 0 ? facts(def, m.f) : null, ...ballFacts(m.f) });
  });
  // ---- kickoff goals: a goal soon after a kickoff, before the defending team ever controls the ball.
  // One defending touch (a deflection that doesn't stop the play) is allowed; two in a row means they had it.
  // 1s: up to 10 s after the kickoff touch (the winner often dribbles or flicks); 2s/3s: up to 6 s.
  const KO_WINDOW = teamSize === 1 ? 10 : 6;
  const koStarts = moments.filter(m => m.type === 'kickoff').map(m => m.f);
  goals.forEach(g => {
    const ko = koStarts.filter(f => f <= g.f).pop(); if (ko === undefined) return;
    const secs = T[g.f] - T[ko]; if (secs > KO_WINDOW) return;
    const between = touches.filter(t => t.f >= ko && t.f <= g.f);
    let run = 0, maxRun = 0, defTouches = 0;
    between.forEach(t => { if (t.team !== g.team) { defTouches++; run++; maxRun = Math.max(maxRun, run); } else run = 0; });
    if (maxRun >= 2) return;
    const k = nameIdx[g.player] ?? -1, [def] = nearestOf(1 - g.team, g.f);
    add('kickoffgoal', g.f, k, { team: g.team, other: def, secsAfterKickoff: r1(secs), defenderTouches: defTouches,
      outcome: `scored ${r1(secs)}s after the kickoff${defTouches ? `, ${defTouches} defending touch` : ''}`, me: k >= 0 ? facts(k, g.f) : null, them: def >= 0 ? facts(def, g.f) : null, ...ballFacts(g.f) });
  });
  (M.demos || []).forEach(d => { const k = keyIdx[d.attacker] ?? -1, o = keyIdx[d.victim] ?? -1; add('demo', d.f, k, { other: o, outcome: o >= 0 ? `${P[o].name} demolished` : 'demolition', me: k >= 0 ? facts(k, d.f) : null }); });
  (M.resets || []).forEach(r => { const k = keyIdx[r.key] ?? -1; if (k >= 0) add('reset', r.f, k, { outcome: 'flip reset', me: facts(k, r.f), ...ballFacts(r.f) }); });

  moments.sort((a, b) => a.f - b.f);

  // ---- numbers per player ----
  const numbers = P.map((p, k) => {
    let tot = 0, behind = 0, def = 0, mid = 0, att = 0, last = 0, dsum = 0, bsum = 0, empty = 0, full = 0, ssum = 0, sup = 0, air = 0, poss = 0;
    const mates = P.map((q, j) => q.team === p.team ? j : -1).filter(j => j >= 0);
    for (let i = 0; i < N; i++) {
      const c = pos(k, i), b = B[i]; if (!active[i] || !c || !b) continue;
      const w = dt(i); tot += w;
      if (goalSide(k, i)) behind += w;
      const y = c[1] * dir(p.team); if (y < -THIRD) def += w; else if (y > THIRD) att += w; else mid += w;
      if (mates.length > 1 && mates.every(j => j === k || !pos(j, i) || pos(j, i)[1] * dir(p.team) >= y)) last += w;
      dsum += dist(c, b) * w; bsum += p.boost[i] * w; if (p.boost[i] <= 5) empty += w; if (p.boost[i] >= 95) full += w;
      const s = spd(k, i); ssum += s * w; if (s >= SUPERSONIC) sup += w; if (airborne(c)) air += w;
      if (lastTouchTeam[i] === p.team) poss += w;
    }
    const pct = x => (tot ? r1(x / tot * 100) : 0);
    const mine = moments.filter(m => m.k === k), cnt = (type, f = () => true) => mine.filter(m => m.type === type && f(m)).length;
    const challengesAll = moments.filter(m => m.type === 'challenge' && (m.k === k || m.other === k));
    const pk = (M.pickups || []).filter(x => x.key === p.key);
    const bigBefore = pk.filter(x => x.big).map(x => p.boost[Math.max(0, x.f - 1)]);
    const kick = moments.filter(m => m.type === 'kickoff');
    return {
      name: p.name, team: p.team,
      playSec: Math.round(tot), behindPct: pct(behind), defPct: pct(def), midPct: pct(mid), attPct: pct(att),
      lastManPct: mates.length > 1 ? pct(last) : null, avgDistBall: tot ? Math.round(dsum / tot / 100) : 0,
      avgBoost: tot ? Math.round(bsum / tot) : 0, emptyBoostPct: pct(empty), fullBoostPct: pct(full),
      bigPads: pk.filter(x => x.big).length, smallPads: pk.filter(x => !x.big).length,
      bigPadWaste: bigBefore.length ? Math.round(bigBefore.reduce((a, b) => a + b, 0) / bigBefore.length) : 0,
      avgSpeed: tot ? Math.round(ssum / tot * KMH) : 0, supersonicPct: pct(sup), airPct: pct(air), possessionPct: pct(poss),
      touches: touches.filter(t => t.k === k).length,
      aerialTouches: touches.filter(t => t.k === k && pos(k, t.f) && airborne(pos(k, t.f)) && B[t.f] && B[t.f][2] > 300).length,
      challenges: challengesAll.length, challengesWon: challengesAll.filter(m => m.winner === p.team).length,
      challengesLost: challengesAll.filter(m => m.winner === 1 - p.team).length,
      kickoffs: kick.length, kickoffsWon: kick.filter(m => m.winner === p.team).length, kickoffsLost: kick.filter(m => m.winner === 1 - p.team).length,
      turnoversLost: cnt('turnover'), turnoversWon: moments.filter(m => m.type === 'turnover' && m.other === k).length,
      clears: cnt('clear'), ballPast: cnt('past'),
      doubleCommits: moments.filter(m => m.type === 'doublecommit' && (m.k === k || m.other === k)).length,
      goals: cnt('goal'), shots: cnt('shot') + cnt('goal'), saves: cnt('save'),
      kickoffGoals: moments.filter(m => m.type === 'kickoffgoal' && m.team === p.team).length,
      kickoffGoalsAgainst: moments.filter(m => m.type === 'kickoffgoal' && m.team !== p.team).length,
      goalsAgainst: goals.filter(g => g.team !== p.team).length,
      demosGiven: cnt('demo'), demosTaken: moments.filter(m => m.type === 'demo' && m.other === k).length, flipResets: cnt('reset'),
    };
  });

  return { version: ENGINE_VERSION, teamSize, numbers, moments: moments.map(m => ({ ...m, player: m.k >= 0 ? P[m.k].name : '', otherName: m.other >= 0 && m.other !== undefined ? P[m.other].name : '' })) };
}

// Rows for the Sheet: GameStats (one per player) and Moments (one per moment). Labels become column headers.
export function toTables(M, D, westIdx, info) {
  const unitLabel = u => (u === '%' ? ' (%)' : u === 'n' || u === 'boost' ? '' : ` (${u})`);
  const teamLabel = t => (t === 0 ? 'Blue' : 'Orange');
  const west = M.players[westIdx];
  const fc = s => (s == null ? '' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));
  const GameStats = D.numbers.map((n, k) => {
    const o = { 'Match date': info.date, Mode: info.mode, 'Result (West)': info.result, Player: n.name, Team: teamLabel(n.team), 'Is West': k === westIdx, 'Same team as West': n.team === west.team };
    NUMBERS.forEach(([key, label, unit]) => { o[label + unitLabel(unit)] = n[key] === null ? '' : n[key]; });
    o['Engine version'] = D.version;
    return o;
  });
  const f = (x, k) => (x && x[k] !== undefined && x[k] !== null ? x[k] : '');
  const Moments = D.moments.map(m => ({
    'Match date': info.date, Type: MOMENT_TYPES[m.type] || m.type, 'Game clock': fc(m.clock), 'Replay time (s)': Math.round(M.t[m.f] * 10) / 10,
    Player: m.player, Team: m.team === 0 || m.team === 1 ? teamLabel(m.team) : '', 'Is West': m.k === westIdx, 'West team': m.team === west.team,
    Outcome: m.outcome || '', 'Other player': m.otherName || '', Zone: f(m.me, 'zone') || m.zone || '',
    Boost: f(m.me, 'boost'), 'Speed (km/h)': f(m.me, 'kmh'), 'Distance to ball (m)': f(m.me, 'distBall'), 'Distance to own goal (m)': f(m.me, 'distGoal'),
    Jumped: f(m.me, 'jumped'), 'In the air': f(m.me, 'air'), 'Goal-side': f(m.me, 'goalSide'),
    'Other boost': f(m.them, 'boost'), 'Other speed (km/h)': f(m.them, 'kmh'), 'Other distance to ball (m)': f(m.them, 'distBall'), 'Other goal-side': f(m.them, 'goalSide'),
    'Seconds after kickoff': m.secsAfterKickoff ?? '', 'Defending touches': m.defenderTouches ?? '',
    'Ball speed (km/h)': m.ballKmh ?? '', 'Ball height (m)': m.ballHeight ?? '', 'Shot speed (km/h)': m.kmh ?? '', 'Seconds to goal': m.secsToGoal ?? '',
    'Engine version': D.version,
  }));
  return { GameStats, Moments };
}
