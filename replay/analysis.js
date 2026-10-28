// Replay Lab: turns a parsed match into West's game stats and "beat moments".
// A beat moment is the instant, before a goal against, when the ball got past him (he went from
// goal-side of the ball to in front of it). Each one gets a proposed cause that West confirms or corrects.
// Rules live here so they can be improved and re-run over every stored replay.

export const ANALYSIS_VERSION = 1;

export const CAUSES = {
  save:       'Last-ditch save missed',
  dove_empty: 'Challenged with no boost',
  challenge:  'Challenged and lost',
  ground:     'Beaten 1v1 on the ground',
  retreat:    'Beaten while rotating back',
  empty:      'Out of boost',
  position:   'Out of position',
  other:      'Something else',
};

const GOAL_Y = 5120, THIRD = 1707;
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function findPlayer(M, re = /westyyy/i) {
  const i = M.players.findIndex(p => re.test(p.name));
  return i < 0 ? 0 : i;
}

// frames with the ball in play (excludes kickoff countdowns and goal replays)
function activeFrames(M) {
  const N = M.t.length, out = new Uint8Array(N);
  let started = false;
  for (let i = 0; i < N; i++) {
    const b = M.ball[i];
    if (!b) { started = false; continue; }
    if (!started && (Math.abs(b[0]) > 5 || Math.abs(b[1]) > 5)) started = true;
    out[i] = started ? 1 : 0;
  }
  return out;
}

export function analyze(M, meIdx = findPlayer(M)) {
  const T = M.t, N = T.length, B = M.ball, me = M.players[meIdx];
  const own = me.team === 0 ? -1 : 1;            // which end West defends (blue = -y)
  const opp = M.players.filter(p => p.team !== me.team);
  const act = activeFrames(M);
  const dt = i => (i < N - 1 ? T[i + 1] - T[i] : 0);
  const goalside = i => { const c = me.track[i], b = B[i]; return !!(c && b && (c[1] - b[1]) * own > 0); };

  // ---- game stats ----
  let tot = 0, behind = 0, def = 0, mid = 0, att = 0, boostSum = 0, empty = 0;
  for (let i = 0; i < N; i++) {
    const c = me.track[i]; if (!act[i] || !c) continue;
    const w = dt(i); tot += w;
    if (goalside(i)) behind += w;
    const y = c[1] * -own;                         // + = toward the opponent's goal
    if (y < -THIRD) def += w; else if (y > THIRD) att += w; else mid += w;
    boostSum += me.boost[i] * w; if (me.boost[i] <= 5) empty += w;
  }
  const pct = x => (tot ? Math.round(x / tot * 1000) / 10 : 0);
  const d = M.meta, myScore = me.team === 0 ? d.Team0Score : d.Team1Score, theirScore = me.team === 0 ? d.Team1Score : d.Team0Score;
  const game = {
    id: M.id, date: (d.Date || '').split(' ')[0], mode: `${d.TeamSize}v${d.TeamSize}`,
    opponent: opp.map(p => p.name.replace(/\s*-_-\s*/, '').trim()).join(', '),
    result: myScore > theirScore ? 'W' : myScore < theirScore ? 'L' : 'T', goalsFor: myScore, goalsAgainst: theirScore,
    playSeconds: Math.round(tot), behindPct: pct(behind), defPct: pct(def), midPct: pct(mid), attPct: pct(att),
    avgBoost: tot ? Math.round(boostSum / tot) : 0, emptyBoostPct: pct(empty), analysisVersion: ANALYSIS_VERSION,
  };

  // ---- beat moments: one per goal against ----
  const frameAt = tt => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const beats = [];
  M.moments.filter(m => m.type === 'goal' && m.team !== me.team).forEach((g, n) => {
    const gf = g.f, start = frameAt(T[gf] - 10);
    let beat = -1;
    for (let i = gf - 1; i > start; i--) if (goalside(i) && !goalside(i + 1)) { beat = i + 1; break; }
    const neverGoalside = beat < 0;
    if (neverGoalside) beat = frameAt(T[gf] - 3);
    // step back to the nearest frame where both West and the ball exist
    while (beat > 0 && !(me.track[beat] && B[beat])) beat--;
    const c = me.track[beat], b = B[beat];
    if (!c || !b) return;
    const dBall = dist3(c, b) / 100, dGoal = Math.hypot(c[0], c[1] - own * GOAL_Y) / 100;
    const boost = me.boost[beat];
    const i0 = frameAt(T[beat] - 1.2), i1 = frameAt(T[beat] + 0.3);
    let jumped = false; for (let i = i0; i <= i1; i++) if (me.act && me.act[i]) { jumped = true; break; }
    const p0 = me.track[Math.max(0, beat - 8)] || c, span = Math.max(1e-3, T[beat] - T[Math.max(0, beat - 8)]);
    const vy = (c[1] - p0[1]) / span, speed = Math.round(Math.hypot(c[0] - p0[0], c[1] - p0[1]) / span);
    const retreating = vy * own > 0;
    const secsBefore = T[gf] - T[beat];
    let cause;
    if (secsBefore < 0.6 && dGoal < 12) cause = 'save';
    else if (jumped && dBall < 6) cause = boost <= 10 ? 'dove_empty' : 'challenge';
    else if (neverGoalside && dBall > 15) cause = 'position';
    else if (boost <= 10) cause = 'empty';
    else if (dBall > 15) cause = 'position';
    else if (retreating) cause = 'retreat';
    else cause = 'ground';
    beats.push({
      n: n + 1, goalFrame: gf, beatFrame: beat, goalClock: M.clock[gf], beatClock: M.clock[beat],
      secsBefore: Math.round(secsBefore * 10) / 10, distBall: Math.round(dBall), distGoal: Math.round(dGoal),
      boost, speed, jumped, retreating, neverGoalside, scorer: g.player, auto: cause, confirmed: '',
    });
  });
  game.beats = beats.length;
  return { game, beats };
}
