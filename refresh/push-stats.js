// Run in the Rocket League Tracker tab (rocketleague.tracker.network) after replacing SOC with tonight's follower counts.
// Reads Tracker stats, merges follower history, and posts everything to the Apps Script backend.
const SOC = { yt: null, tt: null, ig: null, tw: null }; // <- fill in numbers; leave null if a platform failed
const API = 'https://script.google.com/macros/s/AKfycbz8Bgoqpp9JFoaRAn_3ZkCS5ncOvW7BxsVJ_Ql6g6MIE0lRTCiiQfqRKiFW3Al4RQ3P9Q/exec';
const KEY = 'REFRESH_KEY_HERE', FAMILY = 'FAMILY_CODE_HERE';
const H = 'westyyy%20-_-', PID = 44422633;
const g = async u => (await fetch(u, { credentials: 'include' })).json();
const post = b => fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(b) }).then(r => r.json());
const prof = (await g(`https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/${H}`)).data;
const mmr = (await g(`https://api.tracker.gg/api/v1/rocket-league/player-history/mmr/${PID}`)).data || {};
const ses = (await g(`https://api.tracker.gg/api/v2/rocket-league/standard/profile/epic/${H}/sessions`)).data?.items || [];
const seg = n => prof.segments.find(s => s.type === 'playlist' && s.metadata.name === n)?.stats || {};
const pk = n => prof.segments.find(s => s.type === 'peak-rating' && s.metadata.name === n)?.stats?.peakRating;
const pl = n => { const s = seg(n); return { rating: s.rating?.value, tier: s.tier?.metadata?.name, pct: s.rating?.percentile ?? null, matches: s.matchesPlayed?.value ?? 0 }; };
const ov = prof.segments.find(s => s.type === 'overview').stats;
const avgs = prof.segments.filter(s => s.type === 'playlistAverage');
const a1 = avgs.find(s => s.stats.rating?.value === seg('Ranked Duel 1v1').rating?.value)?.stats || avgs[0].stats;
const a2 = avgs.find(s => s.stats.rating?.value === seg('Ranked Doubles 2v2').rating?.value)?.stats || avgs[1].stats;
const current = { updated: new Date().toISOString(), season: prof.metadata.currentSeason,
  life: { wins: ov.wins.value, goals: ov.goals.value, mvps: ov.mVPs.value, saves: ov.saves.value, assists: ov.assists.value, shots: ov.shots.value, seasonRewardLevel: ov.seasonRewardLevel?.value },
  playlists: { '2v2': pl('Ranked Doubles 2v2'), '1v1': pl('Ranked Duel 1v1'), '3v3': pl('Ranked Standard 3v3'), 'Tourney': pl('Tournament Matches') },
  peaks: { '2v2': { rating: pk('Ranked Doubles 2v2')?.value, tier: pk('Ranked Doubles 2v2')?.metadata?.name }, '1v1': { rating: pk('Ranked Duel 1v1')?.value, tier: pk('Ranked Duel 1v1')?.metadata?.name }, '3v3': { rating: pk('Ranked Standard 3v3')?.value, tier: pk('Ranked Standard 3v3')?.metadata?.name } },
  avg: { '1v1': { goals: a1.avgGoalsPerGame.value, acc: a1.goalsShotsRatio.value }, '2v2': { saves: a2.avgSavesPerGame.value } },
  ses: ses.slice(0, 10).map(s => ({ start: s.metadata?.startDate?.value, m: (s.matches || []).map(m => { const st = Object.fromEntries(Object.entries(m.stats || {}).map(([k, v]) => [k, v.value])); return { pl: String(m.metadata?.playlist || '').replace('Ranked ', '').split(' ').pop(), mp: st.matchesPlayed ?? 1, w: st.wins ?? 0, g: st.goals ?? 0, a: st.assists ?? 0, sv: st.saves ?? 0, sh: st.shots ?? 0, mvp: st.mvps ?? 0, r: st.rating ?? null }; }) })) };
const names = { '10': '1v1', '11': '2v2', '13': '3v3', '34': 'Tourney' }, hist = {};
for (const [k, n] of Object.entries(names)) { const by = {}; (mmr[k] || []).forEach(x => by[x.collectDate.slice(0, 10)] = [x.rating, x.tier]); hist[n] = Object.keys(by).sort().map(d => [d, ...by[d]]); }
let out;
if (typeof current.playlists['2v2'].rating !== 'number' || (hist['2v2'] || []).length < 100) out = 'INCOMPLETE';
else {
  const prev = await post({ action: 'getAll', args: [], code: FAMILY });
  const old = (prev.ok && prev.result && prev.result.stats) || {};
  const clean = Object.fromEntries(Object.entries(SOC).filter(([, v]) => typeof v === 'number' && v > 0));
  current.socials = { ...((old.current && old.current.socials) || {}), ...clean, updated: new Date().toISOString() };
  const today = new Date().toISOString().slice(0, 10), fh = ((old.hist && old.hist.followers) || []).filter(x => x[0] !== today);
  fh.push([today, { ...(fh.length ? fh[fh.length - 1][1] : {}), ...clean }]);
  hist.followers = fh.slice(-400);
  out = JSON.stringify(await post({ action: 'stats', token: KEY, current, hist }));
}
out
