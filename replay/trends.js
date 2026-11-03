// Replay Lab · Trends: reports across all of West's games, with "recent" compared to all games.
// Every number is clickable and hands a playlist of clips to the viewer (onClips).
// Data comes from the backend 'trends' action (Games, GameStats, kickoff + goal Moments, MMR history).

export const MIN_GAMES_FOR_TRENDS = 15;
const SPAWNS = ['Diagonal left', 'Diagonal right', 'Off-centre left', 'Off-centre right', 'Back-centre'];
const CHOICES = ['Went for it', 'Fake', 'Hesitated'];
const ATTACKS = ['Kickoff', 'Won it in attacking third', 'Won it in midfield', 'Won it in own third', '50/50 won', 'Rebound off a save', 'Defender touched it in'];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const yes = v => v === true || v === 'TRUE' || v === 'true';
const pct = (a, b) => (b ? Math.round(a / b * 100) : null);
const fmtPct = v => (v === null ? '–' : v + '%');
const short = n => String(n || '').replace(/\s*-_-\s*/g, ' ').trim();

// ---------- data preparation ----------
export function prepare(raw, mode = '1v1') {
  const statsById = {};
  (raw.gameStats || []).forEach(r => { if (yes(r['Is West'])) statsById[r['Replay ID']] = r; });
  const games = (raw.games || []).filter(g => String(g.Mode) === mode).map(g => {
    const st = statsById[g['Replay ID']] || {};
    const time = String(st['Match time'] || g['Match date'] || '');
    return { id: g['Replay ID'], date: String(g['Match date'] || '').slice(0, 10), time, result: String(g.Result || ''), goalsFor: Number(g['Goals for']) || 0, goalsAgainst: Number(g['Goals against']) || 0, opponent: String(g.Opponent || ''), engine: Number(st['Engine version']) || 0 };
  }).sort((a, b) => a.time.localeCompare(b.time));
  const ids = new Set(games.map(g => g.id));
  const moments = (raw.moments || []).filter(m => ids.has(m['Replay ID']));
  return { games, moments, mmr: (raw.mmr || {})[mode] || [], focus: raw.focus };
}

export function scopeIds(data, recent) {
  const g = data.games;
  if (recent === 'focus' && data.focus && data.focus.at) { const d = new Date(data.focus.at).toISOString().slice(0, 10); return new Set(g.filter(x => x.date >= d).map(x => x.id)); }
  const n = recent === 'last5' ? 5 : recent === 'last20' ? 20 : 10;
  return new Set(g.slice(-n).map(x => x.id));
}

// Google Sheets turns a game clock like "4:16" into a time of day (stored in the Sheet's time zone, Berlin); turn it back.
const clockOf = v => {
  const s = String(v ?? '');
  if (!/^1899-12-3\dT/.test(s)) return s;
  const d = new Date(s), p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = t => (p.find(x => x.type === t) || {}).value || '0';
  return `${+g('hour')}:${g('minute')}`;
};
const clipOf = m => ({ id: m['Replay ID'], t: Number(m['Replay time (s)']) || 0, label: `${m.Type} · ${clockOf(m['Game clock'])} · ${String(m['Match date'] || '').slice(0, 10)}`, facts: factsOf(m) });
function factsOf(m) {
  if (m.Type === 'First touch') return [short(m.Player), m.Zone, `went ${m['Touch direction']}`, yes(m['Lined up']) ? 'lined up' : 'not lined up', yes(m['Driving toward own goal']) ? 'driving toward own goal' : '', m.Boost !== undefined ? `${m.Boost} boost` : '', yes(m['Lost within 3s']) ? 'other team got it' : ''].filter(Boolean).join(' · ');
  if (m.Type === 'First defender') return [short(m.Player), m['Challenge choice'] === 'Challenged' ? `challenged · ${m['Challenge result']}` : 'held', yes(m['Teammate behind']) ? 'teammate behind' : 'teammate not behind', yes(m['Goal against within 10s']) ? 'goal against within 10 s' : ''].filter(Boolean).join(' · ');
  if (m.Type === 'Kickoff approach') return [short(m.Player), m.Spawn, m['Kickoff choice'], m.Outcome && String(m.Outcome).split('·')[1], m['Kickoff goal'] ? `kickoff goal ${String(m['Kickoff goal']).toLowerCase()}` : '', yes(m.Flipped) ? 'flipped in' : ''].filter(Boolean).join(' · ');
  return [short(m.Player), m['Attack started'], m['Attack seconds'] !== undefined ? `${m['Attack seconds']} s` : '', m['Shot distance (m)'] !== undefined ? `shot from ${m['Shot distance (m)']} m` : '', yes(m['Shot in the air']) ? 'in the air' : 'on the ground', yes(m['Defender goal-side']) ? 'defender goal-side' : 'defender not goal-side'].filter(Boolean).join(' · ');
}

// ---------- small building blocks ----------
function cell(rows, text, actions, title) {
  if (!rows.length) return `<td class="z">–</td>`;
  const key = actions.register(rows.map(clipOf), title);
  return `<td><button class="tc-btn" type="button" data-clips="${key}" title="Play ${rows.length} clip${rows.length === 1 ? '' : 's'}">${text}</button></td>`;
}
function rolling(vals, n = 5) { return vals.map((_, i) => { const w = vals.slice(Math.max(0, i - n + 1), i + 1).filter(v => v !== null); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; }); }

// SVG timeline: one dot per game (won/lost colour), 5-game rolling line, optional MMR line on its own scale
function timeline(games, series, mmrVals, opts = {}) {
  const W = 680, H = 170, L = 34, R = mmrVals ? 44 : 10, T = 12, B = 26, iw = W - L - R, ih = H - T - B, n = games.length;
  if (n < 2) return '<p class="empty">The timeline appears after 2 games.</p>';
  const x = i => L + (n === 1 ? iw / 2 : i / (n - 1) * iw);
  const all = series.flatMap(s => s.vals).filter(v => v !== null), ymax = opts.ymax ?? Math.max(1, ...all), ymin = opts.ymin ?? 0;
  const y = v => T + ih - (v - ymin) / (ymax - ymin || 1) * ih;
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="tl-svg" role="img" aria-label="${esc(opts.label || 'timeline')}">`;
  [0, .5, 1].forEach(f => { const v = ymin + (ymax - ymin) * f, yy = y(v); svg += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" class="ax" text-anchor="end">${Math.round(v)}${opts.unit || ''}</text>`; });
  if (mmrVals) {
    const mv = mmrVals.filter(v => v !== null);
    if (mv.length) {
      const lo = Math.min(...mv) - 10, hi = Math.max(...mv) + 10, my = v => T + ih - (v - lo) / (hi - lo || 1) * ih;
      const pts = mmrVals.map((v, i) => v === null ? null : `${x(i)},${my(v)}`).filter(Boolean).join(' ');
      svg += `<polyline points="${pts}" class="mmr"/><text x="${W - R + 6}" y="${my(mv[mv.length - 1]) + 4}" class="ax mmrt">${mv[mv.length - 1]}</text><text x="${W - R + 6}" y="${T + 8}" class="ax mmrt">MMR</text>`;
    }
  }
  series.forEach(s => {
    const r = rolling(s.vals), pts = r.map((v, i) => v === null ? null : `${x(i)},${y(v)}`).filter(Boolean).join(' ');
    svg += `<polyline points="${pts}" class="roll" style="stroke:${s.color}"/>`;
    s.vals.forEach((v, i) => { if (v === null) return; const won = games[i].result === 'W'; svg += `<circle cx="${x(i)}" cy="${y(v)}" r="4.5" style="fill:${won ? s.color : 'var(--night)'};stroke:${s.color}"><title>${esc(games[i].date)} ${won ? 'won' : 'lost'} vs ${esc(games[i].opponent)}: ${Math.round(v)}${opts.unit || ''}</title></circle>`; });
  });
  const step = Math.max(1, Math.ceil(n / 8));
  games.forEach((g, i) => { if (i % step === 0 || i === n - 1) svg += `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">${esc(g.date.slice(5))}</text>`; });
  return svg + '</svg>';
}
function mmrForGames(games, hist) {
  return games.map(g => { let v = null; (hist || []).forEach(([d, r]) => { if (String(d) <= g.date) v = Number(r); }); return v; });
}

// ---------- reports ----------
function kickoffRows(data, ids) { return data.moments.filter(m => m.Type === 'Kickoff approach' && yes(m['Is West']) && ids.has(m['Replay ID'])); }
function goalRows(data, ids) { return data.moments.filter(m => m.Type === 'Goal' && ids.has(m['Replay ID'])); }

function kickoffReport(data, allIds, recentIds, showRecent, actions) {
  const A = kickoffRows(data, allIds), Rr = recentIds ? kickoffRows(data, recentIds) : null;
  const S = showRecent && Rr ? Rr : A;
  const got = rows => rows.filter(m => m['Possession after'] === 'His team');
  const kf = (rows, w) => rows.filter(m => m['Kickoff goal'] === w);
  const card = (label, fn, fmt, clipsFn) => {
    const a = fn(A), r = Rr ? fn(Rr) : null;
    const arrow = r === null || a === null ? '' : r > a ? '▲' : r < a ? '▼' : '=';
    const key = clipsFn ? actions.register((showRecent && Rr ? clipsFn(Rr) : clipsFn(A)).map(clipOf), label) : null;
    return `<div class="kpi">${key ? `<button type="button" class="kpi-btn" data-clips="${key}">` : '<div>'}<span class="kl">${esc(label)}</span><b>${fmt(a)}</b>${r !== null ? `<span class="kr">recent ${fmt(r)} ${arrow}</span>` : ''}${key ? '</button>' : '</div>'}</div>`;
  };
  let h = `<section class="rep"><h2>Kickoffs</h2><p class="lede">What West does on each kickoff, by where he starts, and what happens next. Left and right are as West sees it facing the ball.</p><div class="kpis">`;
  h += card('Kickoffs', r => r.length, v => v, r => r);
  h += card('His side got the ball', r => pct(got(r).length, r.length), fmtPct, got);
  h += card('Kickoff goals for', r => kf(r, 'For').length, v => v, r => kf(r, 'For'));
  h += card('Kickoff goals against', r => kf(r, 'Against').length, v => v, r => kf(r, 'Against'));
  h += `</div><div class="tblwrap"><table class="rt"><thead><tr><th>Spawn</th>${CHOICES.map(c => `<th>${c}</th>`).join('')}<th>All</th></tr></thead><tbody>`;
  const cellTxt = rows => { const p = pct(got(rows).length, rows.length), f = kf(rows, 'For').length, a = kf(rows, 'Against').length; return `<b>${rows.length}</b><span class="sub">${fmtPct(p)} ball${f ? ` · <i class="pos">+${f}</i>` : ''}${a ? ` · <i class="neg">−${a}</i>` : ''}</span>`; };
  [...SPAWNS, 'All'].forEach(sp => {
    const rowsSp = sp === 'All' ? S : S.filter(m => m.Spawn === sp);
    h += `<tr${sp === 'All' ? ' class="tot"' : ''}><th>${sp}</th>${[...CHOICES, 'All'].map(c => { const rows = c === 'All' ? rowsSp : rowsSp.filter(m => m['Kickoff choice'] === c); return cell(rows, cellTxt(rows), actions, `Kickoffs · ${sp} · ${c}`); }).join('')}</tr>`;
  });
  h += `</tbody></table></div><p class="note">Each cell: how many kickoffs · how often his side got the ball next · <i class="pos">+kickoff goals for</i> · <i class="neg">−kickoff goals against</i>. Click a cell to watch those kickoffs.</p>`;
  const per = data.games.map(g => { const rows = A.filter(m => m['Replay ID'] === g.id); return rows.length ? pct(got(rows).length, rows.length) : null; });
  h += `<h3>His side got the ball after kickoffs, game by game</h3>${timeline(data.games, [{ vals: per, color: 'var(--blue)' }], mmrForGames(data.games, data.mmr), { unit: '%', ymax: 100, label: 'Kickoff possession by game' })}<p class="note">Dots: filled = won the game, hollow = lost. Line: 5-game average. Grey line: 1v1 MMR.</p></section>`;
  return h;
}

function goalReport(data, allIds, recentIds, showRecent, actions) {
  const rows = showRecent && recentIds ? goalRows(data, recentIds) : goalRows(data, allIds);
  const forG = rows.filter(m => yes(m['West team'])), agG = rows.filter(m => !yes(m['West team']));
  const groups = [
    ['How the attack started', ATTACKS.map(a => [a, m => m['Attack started'] === a])],
    ['How quickly they scored', [['Within 3 s of winning the ball', m => Number(m['Attack seconds']) <= 3], ['3–8 s', m => Number(m['Attack seconds']) > 3 && Number(m['Attack seconds']) <= 8], ['More than 8 s', m => Number(m['Attack seconds']) > 8]]],
    ['Where the shot came from', [['Close (under 15 m)', m => Number(m['Shot distance (m)']) < 15], ['Medium (15–40 m)', m => Number(m['Shot distance (m)']) >= 15 && Number(m['Shot distance (m)']) <= 40], ['Long (over 40 m)', m => Number(m['Shot distance (m)']) > 40]]],
    ['The shot', [['On the ground', m => !yes(m['Shot in the air'])], ['In the air', m => yes(m['Shot in the air'])]]],
    ['The defender at the shot', [['Goal-side', m => yes(m['Defender goal-side'])], ['Not goal-side', m => m['Defender goal-side'] !== undefined && !yes(m['Defender goal-side'])], ['Had under 15 boost', m => Number(m['Defender boost']) < 15]]],
  ];
  let h = `<section class="rep"><h2>Goals</h2><p class="lede">How West scores, next to how opponents score on him. Click any number to watch those goals.</p>
    <div class="tblwrap"><table class="rt goals"><thead><tr><th></th><th>West scores <span class="sub">(${forG.length})</span></th><th>Opponents score <span class="sub">(${agG.length})</span></th></tr></thead><tbody>`;
  groups.forEach(([title, items]) => {
    h += `<tr class="grp"><th colspan="3">${title}</th></tr>`;
    items.forEach(([label, test]) => {
      const a = forG.filter(test), b = agG.filter(test);
      h += `<tr><th>${label}</th>${cell(a, `<b>${a.length}</b><span class="sub">${fmtPct(pct(a.length, forG.length))}</span>`, actions, `West scores · ${label}`)}${cell(b, `<b>${b.length}</b><span class="sub">${fmtPct(pct(b.length, agG.length))}</span>`, actions, `Opponents score · ${label}`)}</tr>`;
    });
  });
  h += `</tbody></table></div>`;
  const gf = data.games.map(g => g.goalsFor), ga = data.games.map(g => g.goalsAgainst);
  h += `<h3>Goals for and against, game by game</h3>${timeline(data.games, [{ vals: gf, color: 'var(--mint)' }, { vals: ga, color: 'var(--pink)' }], null, { label: 'Goals by game' })}<p class="note"><span style="color:var(--mint)">●</span> goals for · <span style="color:var(--pink)">●</span> goals against · filled = won, hollow = lost · lines: 5-game average.</p></section>`;
  return h;
}

// biggest changes between recent games and all games, only when there's enough data
function changes(data, allIds, recentIds, actions) {
  const K = ids => kickoffRows(data, ids), G = ids => goalRows(data, ids);
  const metrics = [
    { label: 'His side got the ball after kickoffs', unit: '%', calc: ids => { const r = K(ids); return r.length >= 15 ? pct(r.filter(m => m['Possession after'] === 'His team').length, r.length) : null; }, clips: ids => K(ids).filter(m => m['Possession after'] !== 'His team') },
    { label: 'Kickoff goals against per 10 kickoffs', unit: '', calc: ids => { const r = K(ids); return r.length >= 15 ? Math.round(r.filter(m => m['Kickoff goal'] === 'Against').length / r.length * 100) / 10 : null; }, clips: ids => K(ids).filter(m => m['Kickoff goal'] === 'Against'), lowerBetter: true },
    { label: 'Hesitated on kickoffs', unit: '%', calc: ids => { const r = K(ids); return r.length >= 15 ? pct(r.filter(m => m['Kickoff choice'] === 'Hesitated').length, r.length) : null; }, clips: ids => K(ids).filter(m => m['Kickoff choice'] === 'Hesitated'), lowerBetter: true },
    { label: 'Goals for per game', unit: '', calc: ids => { const g = data.games.filter(x => ids.has(x.id)); return g.length >= 5 ? Math.round(g.reduce((a, x) => a + x.goalsFor, 0) / g.length * 10) / 10 : null; }, clips: ids => G(ids).filter(m => yes(m['West team'])) },
    { label: 'Goals against per game', unit: '', calc: ids => { const g = data.games.filter(x => ids.has(x.id)); return g.length >= 5 ? Math.round(g.reduce((a, x) => a + x.goalsAgainst, 0) / g.length * 10) / 10 : null; }, clips: ids => G(ids).filter(m => !yes(m['West team'])), lowerBetter: true },
    { label: 'Goals against that started from a kickoff', unit: '%', calc: ids => { const r = G(ids).filter(m => !yes(m['West team'])); return r.length >= 10 ? pct(r.filter(m => m['Attack started'] === 'Kickoff').length, r.length) : null; }, clips: ids => G(ids).filter(m => !yes(m['West team']) && m['Attack started'] === 'Kickoff'), lowerBetter: true },
  ];
  const out = metrics.map(mt => { const a = mt.calc(allIds), r = mt.calc(recentIds); return a === null || r === null ? null : { ...mt, a, r, rel: Math.abs(r - a) / Math.max(1, Math.abs(a)) }; }).filter(x => x && x.r !== x.a).sort((x, y) => y.rel - x.rel).slice(0, 4);
  if (!out.length) return '<p class="empty">No clear changes between recent games and all games yet.</p>';
  return '<ul class="chg">' + out.map(c => { const better = c.lowerBetter ? c.r < c.a : c.r > c.a, key = actions.register(c.clips(recentIds).map(clipOf), c.label + ' (recent)');
    return `<li><span class="${better ? 'pos' : 'neg'}">${c.r > c.a ? '▲' : '▼'}</span> <b>${esc(c.label)}:</b> ${c.a}${c.unit} overall → <b>${c.r}${c.unit}</b> recently <button class="btn sm" type="button" data-clips="${key}">▶ clips</button></li>`; }).join('') + '</ul>';
}

// ---------- 2v2 ----------
// Every table puts games West's team won next to games they lost, so the differences show.
const MIN_ENGINE_2V2 = 4;   // first touch, first defender and goal-against positions need engine v4
const num = v => (v === '' || v === undefined ? null : Number(v));
const isW = m => yes(m['Is West']);
function wlCols(data, ids) {
  const res = Object.fromEntries(data.games.map(g => [g.id, g.result]));
  const pick = r => new Set([...ids].filter(id => res[id] === r));
  return [['Wins', pick('W')], ['Losses', pick('L')], ['All', ids]];
}
// items: [label, base(rows) → rows, hit(row) → bool | null, kind]   kind 'pct' = share of base · 'n' = count (with per game) · 'grp' = heading
function wlTable(rowsOf, data, ids, items, actions, title, opts = {}) {
  const cols = wlCols(data, ids).map(([name, s]) => ({ name, ids: s, rows: rowsOf(s) }));
  let h = `<div class="tblwrap"><table class="rt wl"><thead><tr><th></th>${cols.map(c => `<th>${c.name} <span class="sub">(${c.ids.size} game${c.ids.size === 1 ? '' : 's'})</span></th>`).join('')}</tr></thead><tbody>`;
  items.forEach(([label, base, hit, kind]) => {
    if (kind === 'grp') { h += `<tr class="grp"><th colspan="${cols.length + 1}">${label}</th></tr>`; return; }
    h += `<tr><th>${label}</th>` + cols.map(c => {
      const b = base(c.rows), hits = hit ? b.filter(hit) : b;
      if (kind === 'n') return cell(b, `<b>${b.length}</b><span class="sub">${c.ids.size ? Math.round(b.length / c.ids.size * 10) / 10 : 0} per game</span>`, actions, `${title} · ${label} · ${c.name}`);
      const p = pct(hits.length, b.length);
      if (b.length && !hits.length) return `<td class="z"><span class="tc-0"><b>0%</b><span class="sub">0 of ${b.length}</span></span></td>`;
      return cell(hits, `<b>${fmtPct(p)}</b><span class="sub">${hits.length} of ${b.length}</span>`, actions, `${title} · ${label} · ${c.name}`);
    }).join('') + '</tr>';
  });
  return h + `</tbody></table></div>${opts.note ? `<p class="note">${opts.note}</p>` : ''}`;
}
const all_ = r => r;
function twosFirstTouch(data, ids, actions) {
  const rowsOf = s => data.moments.filter(m => m.Type === 'First touch' && isW(m) && s.has(m['Replay ID']));
  const dirIs = d => m => m['Touch direction'] === d, lined = m => yes(m['Lined up']), back = m => yes(m['Driving toward own goal']);
  const fwd = dirIs('forward');
  const items = [
    ['First touches', all_, null, 'n'],
    ['Where the ball went', null, null, 'grp'],
    ['Forward (toward their goal)', all_, fwd, 'pct'], ['Sideways', all_, dirIs('sideways'), 'pct'], ['Backward', all_, dirIs('backward'), 'pct'], ['Soft touch (under 15 km/h)', all_, dirIs('soft'), 'pct'],
    ['How he arrived', null, null, 'grp'],
    ['Lined up behind the ball', all_, lined, 'pct'], ['Driving toward his own goal', all_, back, 'pct'], ['Boost 0–5', all_, m => num(m.Boost) !== null && num(m.Boost) <= 5, 'pct'],
    ['Forward, by how he arrived', null, null, 'grp'],
    ['When lined up', r => r.filter(lined), fwd, 'pct'], ['When not lined up', r => r.filter(m => !lined(m)), fwd, 'pct'],
    ['When driving toward own goal', r => r.filter(back), fwd, 'pct'], ['When boost 0–5', r => r.filter(m => num(m.Boost) !== null && num(m.Boost) <= 5), fwd, 'pct'],
    ['Forward, by where on the field', null, null, 'grp'],
    ['Own third', r => r.filter(m => m.Zone === 'own third'), fwd, 'pct'], ['Middle third', r => r.filter(m => m.Zone === 'middle third'), fwd, 'pct'], ['Attacking third', r => r.filter(m => m.Zone === 'attacking third'), fwd, 'pct'],
    ['What happened next', null, null, 'grp'],
    ['Other team got the ball within 3 s', all_, m => yes(m['Lost within 3s']), 'pct'], ['His team shot within 6 s', all_, m => yes(m['Shot within 6s']), 'pct'],
    ['Goal against within 10 s', all_, m => yes(m['Goal against within 10s']), 'pct'],
  ];
  return `<section class="rep"><h2>First touch</h2><p class="lede">Every time West touches the ball first: after the other team had it, or after 2 seconds with no touch from his team. Lined up = his car was behind the ball, within 60° of the line to their goal.</p>
    ${wlTable(rowsOf, data, ids, items, actions, 'First touch', { note: 'Click any number to watch those touches.' })}</section>`;
}
function twosKickoffs(data, ids, actions) {
  // one entry per kickoff: West's row plus his teammate's row from the same kickoff
  const rowsOf = s => {
    const ko = data.moments.filter(m => m.Type === 'Kickoff approach' && yes(m['West team']) && s.has(m['Replay ID']));
    const by = {}; ko.forEach(m => { const k = m['Replay ID'] + '@' + m['Replay time (s)']; (by[k] = by[k] || []).push(m); });
    return Object.values(by).map(g => { const w = g.find(isW), o = g.find(m => !isW(m)); if (!w) return null;
      const wg = w['Kickoff choice'] === 'Went for it', og = o && o['Kickoff choice'] === 'Went for it';
      return Object.assign({}, w, { who: wg && og ? 'Both went' : wg ? 'West went' : og ? 'Teammate went' : 'Neither went' }); }).filter(Boolean);
  };
  const got = m => m['Possession after'] === 'His team', who = w => r => r.filter(m => m.who === w);
  const items = [
    ['Kickoffs', all_, null, 'n'],
    ['His team got the ball next', all_, got, 'pct'], ['Kickoff goal for', all_, m => m['Kickoff goal'] === 'For', 'pct'], ['Kickoff goal against', all_, m => m['Kickoff goal'] === 'Against', 'pct'],
    ['Who went for the ball', null, null, 'grp'],
    ...['West went', 'Teammate went', 'Both went', 'Neither went'].map(w => [w, all_, m => m.who === w, 'pct']),
    ['His team got the ball next, by who went', null, null, 'grp'],
    ...['West went', 'Teammate went', 'Both went'].map(w => [w, who(w), got, 'pct']),
    ['When West went: his approach', null, null, 'grp'],
    ['Flipped into the ball', r => r.filter(m => m['Kickoff choice'] === 'Went for it'), m => yes(m.Flipped), 'pct'],
    ['His team got the ball, flipped in', r => r.filter(m => m['Kickoff choice'] === 'Went for it' && yes(m.Flipped)), got, 'pct'],
    ['His team got the ball, did not flip', r => r.filter(m => m['Kickoff choice'] === 'Went for it' && !yes(m.Flipped)), got, 'pct'],
  ];
  return `<section class="rep"><h2>Kickoffs</h2><p class="lede">Who went for the ball on each kickoff (West, his teammate or both), and which team got the ball next.</p>${wlTable(rowsOf, data, ids, items, actions, 'Kickoffs')}</section>`;
}
function twosChallenges(data, ids, actions) {
  const rowsOf = s => data.moments.filter(m => m.Type === 'First defender' && isW(m) && s.has(m['Replay ID']));
  const ch = m => m['Challenge choice'] === 'Challenged', cov = m => yes(m['Teammate behind']), ga = m => yes(m['Goal against within 10s']);
  const res = r => m => m['Challenge result'] === r;
  const items = [
    ['Times West was first defender', all_, null, 'n'],
    ['Went at the ball (challenged)', all_, ch, 'pct'], ['Held (waited)', all_, m => !ch(m), 'pct'],
    ['When he challenged', null, null, 'grp'],
    ['Teammate was behind him', r => r.filter(ch), cov, 'pct'], ['Won the ball', r => r.filter(ch), res('won the ball'), 'pct'], ['50/50', r => r.filter(ch), res('50/50'), 'pct'], ['Missed the ball', r => r.filter(ch), res('missed the ball'), 'pct'],
    ['Goal against within 10 s', null, null, 'grp'],
    ['Challenged, teammate behind', r => r.filter(m => ch(m) && cov(m)), ga, 'pct'], ['Challenged, teammate not behind', r => r.filter(m => ch(m) && !cov(m)), ga, 'pct'],
    ['Held, teammate behind', r => r.filter(m => !ch(m) && cov(m)), ga, 'pct'], ['Held, teammate not behind', r => r.filter(m => !ch(m) && !cov(m)), ga, 'pct'],
  ];
  return `<section class="rep"><h2>Challenges</h2><p class="lede">Times the other team had the ball in their half and West was his team's closest player, goal-side, 5–30 m away. Did he go at the ball or hold, where was his teammate, and what followed. Missed the ball = he went for it and didn't touch it.</p>
    ${wlTable(rowsOf, data, ids, items, actions, 'Challenges')}</section>`;
}
function twosGoals(data, ids, allScope, showRecent, actions) {
  const rowsOf = s => data.moments.filter(m => m.Type === 'Goal' && !yes(m['West team']) && s.has(m['Replay ID']) && m['West goal-side at shot'] !== undefined);
  const wgs = m => yes(m['West goal-side at shot']), mgs = m => yes(m['Teammate goal-side at shot']), last = m => m['Last touch before (defending team)'];
  const items = [
    ['Goals against', all_, null, 'n'],
    ['Where West and his teammate were at the shot', null, null, 'grp'],
    ['Both goal-side', all_, m => wgs(m) && mgs(m), 'pct'], ['Only West goal-side', all_, m => wgs(m) && !mgs(m), 'pct'], ['Only teammate goal-side', all_, m => !wgs(m) && mgs(m), 'pct'], ['Neither goal-side', all_, m => !wgs(m) && !mgs(m), 'pct'],
    ['West in the air at the shot', all_, m => yes(m['West in the air at shot']), 'pct'],
    ["His team's last touch before the goal", null, null, 'grp'],
    ['By West', all_, m => !!last(m) && /westyyy/i.test(last(m)), 'pct'], ['By his teammate', all_, m => !!last(m) && !/westyyy/i.test(last(m)), 'pct'], ['No touch by his team', all_, m => !last(m), 'pct'],
    ['That touch went', null, null, 'grp'],
    ...['forward', 'sideways', 'backward', 'soft'].map(d => [d[0].toUpperCase() + d.slice(1), r => r.filter(last), m => m['That touch went'] === d, 'pct']),
  ];
  return `<section class="rep"><h2>Goals against: where everyone was</h2><p class="lede">For each goal against: whether West and his teammate were between the ball and their goal when the shot was hit, and who on his team touched the ball last before it.</p>
    ${wlTable(rowsOf, data, ids, items, actions, 'Goals against')}</section>` + goalReport(data, allScope, null, showRecent, actions).replace('<h2>Goals</h2>', '<h2>Goals for and against</h2>').replace('How West scores, next to how opponents score on him.', "How West's team scores, next to how opponents score.").replace('West scores <span', "West's team scores <span");
}
function twosTimeline(data, actions) {
  const per = f => data.games.map(g => { const r = data.moments.filter(m => m.Type === 'First touch' && isW(m) && m['Replay ID'] === g.id); return r.length >= 5 ? pct(r.filter(f).length, r.length) : null; });
  const fwd = per(m => m['Touch direction'] === 'forward'), lined = per(m => yes(m['Lined up']));
  const ko = data.games.map(g => { const r = data.moments.filter(m => m.Type === 'Kickoff approach' && isW(m) && m['Replay ID'] === g.id); return r.length ? pct(r.filter(m => m['Possession after'] === 'His team').length, r.length) : null; });
  return `<section class="rep"><h2>Game by game</h2><h3>First touch: forward and lined up</h3>${timeline(data.games, [{ vals: fwd, color: 'var(--mint)' }, { vals: lined, color: 'var(--blue)' }], mmrForGames(data.games, data.mmr), { unit: '%', ymax: 100, label: 'First touch by game' })}
    <p class="note"><span style="color:var(--mint)">●</span> first touches forward · <span style="color:var(--blue)">●</span> lined up · filled = won, hollow = lost · lines: 5-game average · grey line: 2v2 MMR.</p>
    <h3>His team got the ball after kickoffs</h3>${timeline(data.games, [{ vals: ko, color: 'var(--gold)' }], null, { unit: '%', ymax: 100, label: 'Kickoff possession by game' })}</section>`;
}
function twosChanges(data, allIds, recentIds, actions) {
  const FT = ids => data.moments.filter(m => m.Type === 'First touch' && isW(m) && ids.has(m['Replay ID'])), FD = ids => data.moments.filter(m => m.Type === 'First defender' && isW(m) && ids.has(m['Replay ID']));
  const K = ids => kickoffRows(data, ids), G = ids => data.games.filter(x => ids.has(x.id));
  const share = (rowsFn, test, min = 30) => ids => { const r = rowsFn(ids); return r.length >= min ? pct(r.filter(test).length, r.length) : null; };
  const metrics = [
    { label: 'First touches forward', unit: '%', calc: share(FT, m => m['Touch direction'] === 'forward'), clips: ids => FT(ids).filter(m => m['Touch direction'] !== 'forward') },
    { label: 'Lined up at the first touch', unit: '%', calc: share(FT, m => yes(m['Lined up'])), clips: ids => FT(ids).filter(m => !yes(m['Lined up'])) },
    { label: 'First touch with boost 0–5', unit: '%', calc: share(FT, m => num(m.Boost) <= 5), clips: ids => FT(ids).filter(m => num(m.Boost) <= 5), lowerBetter: true },
    { label: 'Other team got it within 3 s of his first touch', unit: '%', calc: share(FT, m => yes(m['Lost within 3s'])), clips: ids => FT(ids).filter(m => yes(m['Lost within 3s'])), lowerBetter: true },
    { label: 'Challenged with teammate not behind', unit: '%', calc: share(FD, m => m['Challenge choice'] === 'Challenged' && !yes(m['Teammate behind']), 15), clips: ids => FD(ids).filter(m => m['Challenge choice'] === 'Challenged' && !yes(m['Teammate behind'])), lowerBetter: true },
    { label: 'His team got the ball after kickoffs', unit: '%', calc: share(K, m => m['Possession after'] === 'His team', 15), clips: ids => K(ids).filter(m => m['Possession after'] !== 'His team') },
    { label: 'Goals for per game', unit: '', calc: ids => { const g = G(ids); return g.length >= 5 ? Math.round(g.reduce((a, x) => a + x.goalsFor, 0) / g.length * 10) / 10 : null; }, clips: ids => goalRows(data, ids).filter(m => yes(m['West team'])) },
    { label: 'Goals against per game', unit: '', calc: ids => { const g = G(ids); return g.length >= 5 ? Math.round(g.reduce((a, x) => a + x.goalsAgainst, 0) / g.length * 10) / 10 : null; }, clips: ids => goalRows(data, ids).filter(m => !yes(m['West team'])), lowerBetter: true },
  ];
  const out = metrics.map(mt => { const a = mt.calc(allIds), r = mt.calc(recentIds); return a === null || r === null ? null : { ...mt, a, r, rel: Math.abs(r - a) / Math.max(1, Math.abs(a)) }; }).filter(x => x && x.r !== x.a).sort((x, y) => y.rel - x.rel).slice(0, 4);
  if (!out.length) return '<p class="empty">No clear changes between recent games and all games yet.</p>';
  return '<ul class="chg">' + out.map(c => { const better = c.lowerBetter ? c.r < c.a : c.r > c.a, key = actions.register(c.clips(recentIds).map(clipOf), c.label + ' (recent)');
    return `<li><span class="${better ? 'pos' : 'neg'}">${c.r > c.a ? '▲' : '▼'}</span> <b>${esc(c.label)}:</b> ${c.a}${c.unit} overall → <b>${c.r}${c.unit}</b> recently <button class="btn sm" type="button" data-clips="${key}">▶ clips</button></li>`; }).join('') + '</ul>';
}
function twos(data, allIds, recentIds, showRecent, enough, actions) {
  const ids = showRecent && recentIds ? recentIds : allIds;
  const fresh = new Set(data.games.filter(g => g.engine >= MIN_ENGINE_2V2).map(g => g.id)), freshIds = new Set([...ids].filter(id => fresh.has(id)));
  const old = data.games.length - fresh.size;
  let h = '';
  if (old) h += `<div class="gate">${old} of ${data.games.length} games were analysed before first touches and challenges were added, so First touch, Challenges and Goals against use the other ${fresh.size}. Opening a game in Replays updates it.</div>`;
  h += enough ? `<section class="rep"><h2>What's changing</h2>${twosChanges(data, allIds, recentIds, actions)}</section>`
    : `<div class="gate">Comparisons of recent games start after ${MIN_GAMES_FOR_TRENDS} games (${data.games.length} so far). Showing all games.</div>`;
  h += `<p class="lede">Each table puts games his team won next to games they lost. ${showRecent ? 'Showing recent games only.' : ''}</p>`;
  h += twosFirstTouch(data, freshIds, actions);
  h += twosKickoffs(data, ids, actions);
  h += twosChallenges(data, freshIds, actions);
  h += twosGoals(data, freshIds, ids, showRecent, actions);
  h += twosTimeline(data, actions);
  return h;
}

// ---------- page ----------
export function renderTrends(root, raw, state, actions) {
  const data = prepare(raw, state.mode);
  const allIds = new Set(data.games.map(g => g.id)), n = data.games.length;
  const enough = n >= MIN_GAMES_FOR_TRENDS;
  const recentIds = enough ? scopeIds(data, state.recent) : null;
  const showRecent = enough && state.view === 'recent';
  actions.reset();
  let h = `<div class="tr-head"><div><h1>Trends</h1><p class="lede">${n} ${state.mode} game${n === 1 ? '' : 's'} analysed${data.games.length ? ` · ${esc(data.games[0].date)} to ${esc(data.games[n - 1].date)}` : ''}</p></div>
    <div class="tr-filters">
      <label>Mode <select id="trMode"><option value="1v1"${state.mode === '1v1' ? ' selected' : ''}>1v1</option><option value="2v2"${state.mode === '2v2' ? ' selected' : ''}>2v2</option></select></label>
      <label>Recent means <select id="trRecent"${enough ? '' : ' disabled'}>${[['last5', 'Last 5 games'], ['last10', 'Last 10 games'], ['last20', 'Last 20 games'], ['focus', 'Since the current focus']].map(([v, t]) => `<option value="${v}"${state.recent === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <div class="seg" role="group" aria-label="Show"><button type="button" id="trAll" aria-pressed="${!showRecent}">All games</button><button type="button" id="trRec" aria-pressed="${showRecent}"${enough ? '' : ' disabled'}>Recent</button></div>
    </div></div>`;
  if (!n) h += `<p class="empty">No ${state.mode} games yet. Open replays in Replays and they show up here.</p>`;
  else {
  if (state.mode === '2v2') h += twos(data, allIds, recentIds, showRecent, enough, actions);
  else {
    h += enough ? `<section class="rep"><h2>What's changing</h2>${changes(data, allIds, recentIds, actions)}</section>`
      : `<div class="gate">Comparisons of recent games start after ${MIN_GAMES_FOR_TRENDS} games (${n} so far). Showing all games.</div>`;
    h += kickoffReport(data, allIds, recentIds, showRecent, actions);
    h += goalReport(data, allIds, recentIds, showRecent, actions);
  }
  }
  root.innerHTML = h;
  root.querySelectorAll('[data-clips]').forEach(b => b.onclick = () => actions.play(b.dataset.clips));
  const q = id => root.querySelector('#' + id);
  q('trMode').onchange = e => actions.set({ mode: e.target.value });
  q('trRecent').onchange = e => actions.set({ recent: e.target.value });
  q('trAll').onclick = () => actions.set({ view: 'all' });
  q('trRec').onclick = () => actions.set({ view: 'recent' });
}
