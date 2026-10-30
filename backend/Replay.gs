/**
 * Westyyy Career Mode: Replay Lab storage.
 * A second script file (Replay.gs) in the same Apps Script project as Code.gs.
 *
 * Google Drive:
 *   "Westyyy Replay Lab" folder   the original .replay files (kept forever, so analysis can be re-run)
 *
 * Tabs it creates in the Sheet:
 *   Replays       one row per stored replay file
 *   Games         one row per game: behind-ball %, thirds, boost, result
 *   BeatMoments   one row per goal against: where West got beat, proposed cause, West's confirmed cause
 *   ReplayTags    one row per tag West makes while reviewing
 *   GameStats     one row per player per game: every number the data engine computes (columns grow with the engine)
 *   Moments       one row per moment (kickoff, 50/50, turnover, clear, ball got past, goal, shot, save, demo...) with facts
 *   RefReplays    reference games (pros, other players): never counted in West's games, Trends or Career Mode
 *   Clips         saved clips: a few seconds cut out of a game, stored as a small file in the Clips folder
 *   Compilations  ordered lists of clips that play as one reel
 *
 * Google Drive (created on first use):
 *   "Westyyy Replay Lab - Reference"   reference .replay files
 *   "Westyyy Replay Lab - Clips"       clip files (.json)
 *
 * After adding or changing this file: run authorizeReplayLab once from the editor, then
 * Deploy > Manage deployments > Edit > New version.
 */

const R_HEAD = ['Replay ID', 'Match date', 'Mode', 'Opponent', 'Result', 'Game clock', 'Replay time (s)', 'Category', 'Note', 'Snapshot', 'Saved at'];
const R_MAX_TAGS = 80;
const LIB_HEAD = ['Replay ID', 'Match date', 'Mode', 'Opponent', 'Result', 'Drive file ID', 'File name', 'Size (KB)', 'Added at', 'Original file name'];
const GAME_HEAD = ['Replay ID', 'Match date', 'Mode', 'Opponent', 'Result', 'Goals for', 'Goals against', 'Play seconds',
  'Behind ball %', 'Own third %', 'Middle third %', 'Attacking third %', 'Avg boost', 'Empty boost %', 'Beat moments', 'Analysis version', 'Updated at'];
const BEAT_HEAD = ['Replay ID', 'Match date', 'Goal #', 'Goal clock', 'Beat clock', 'Seconds before goal', 'Distance to ball (m)', 'Distance to own goal (m)',
  'Boost', 'Speed', 'Jumped', 'Retreating', 'Scorer', 'Auto cause', 'Confirmed cause', 'Updated at'];
const REPLAY_FOLDER = 'Westyyy Replay Lab';
const REF_HEAD = ['Replay ID', 'Match date', 'Mode', 'Players', 'Follow player', 'Result', 'Drive file ID', 'File name', 'Size (KB)', 'Added at', 'Original file name'];
const CLIP_HEAD = ['Clip ID', 'Title', 'Tags', 'Source', 'Replay ID', 'Follow player', 'Start (s)', 'End (s)', 'Key moment (s)', 'Match', 'Data file ID', 'Size (KB)', 'Created at'];
const COMP_HEAD = ['Compilation ID', 'Title', 'Clip IDs', 'Notes', 'Updated at'];
const MAX_CLIP_CHARS = 3 * 1024 * 1024;
const MAX_REPLAY_BYTES = 15 * 1024 * 1024;

// Run once from the editor so Google asks for Drive permission.
function authorizeReplayLab() {
  Logger.log('Replay folder: ' + replayFolder_().getName() + ' (' + replayFolder_().getId() + ')');
}

// ---------- entry point: Code.gs routes action "replay" here ----------
function replayAction(name, ...args) {
  const fns = { library: libGet_, add: libAdd_, file: libFile_, saveBeats: libSaveBeats_, remove: libRemove_, trends: libTrends_,
    refAdd: refAdd_, refFile: refFile_, refRemove: refRemove_, refFollow: refFollow_,
    clips: clipsGet_, clipAdd: clipAdd_, clipData: clipData_, clipUpdate: clipUpdate_, clipRemove: clipRemove_, compSave: compSave_, compRemove: compRemove_ };
  const fn = fns[name];
  if (!fn) throw new Error('Unknown replay action');
  return fn.apply(null, args);
}

// Older Replay Lab pages call these two directly.
function getReplayReviews() { return { focus: prop_('FOCUS', null), reviews: readReplayTags_() }; }
function saveReplayReview(r) {
  checkId_(r && r.id);
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const tags = (Array.isArray(r.tags) ? r.tags : []).slice(0, R_MAX_TAGS);
  const now = new Date();
  const rows = tags.map(g => {
    const snap = g.snap ? JSON.stringify(g.snap) : '';
    return [String(r.id), clip(r.date, 10), clip(r.mode, 5), clip(r.opponent, 80), clip(r.result, 12),
      clip(g.clock, 6), Math.max(0, Math.min(3600, Number(g.t) || 0)), clip(g.cat, 40), clip(g.note, 300),
      snap.length <= 3000 ? snap : '', now];
  });
  withLock_(() => replaceRows_(sheet_('ReplayTags', R_HEAD), r.id, rows, R_HEAD.length));
  return true;
}

// ---------- library ----------
function libGet_() {
  const replays = readRows_('Replays', LIB_HEAD).map(r => ({ id: r[0], date: fmtDate_(r[1]), mode: r[2], opponent: r[3], result: r[4], fileId: r[5], name: r[6], sizeKB: Number(r[7]) || 0, added: String(r[8]), originalName: String(r[9] || '') }));
  const games = readRows_('Games', GAME_HEAD).map(r => ({ id: r[0], date: fmtDate_(r[1]), mode: r[2], opponent: r[3], result: r[4], goalsFor: Number(r[5]), goalsAgainst: Number(r[6]),
    playSeconds: Number(r[7]), behindPct: Number(r[8]), defPct: Number(r[9]), midPct: Number(r[10]), attPct: Number(r[11]), avgBoost: Number(r[12]), emptyBoostPct: Number(r[13]), beats: Number(r[14]), analysisVersion: Number(r[15]) }));
  const beats = {};
  readRows_('BeatMoments', BEAT_HEAD).forEach(r => {
    (beats[r[0]] = beats[r[0]] || []).push({ n: Number(r[2]), goalClock: Number(r[3]), beatClock: Number(r[4]), secsBefore: Number(r[5]), distBall: Number(r[6]), distGoal: Number(r[7]),
      boost: Number(r[8]), speed: Number(r[9]), jumped: r[10] === true || r[10] === 'TRUE', retreating: r[11] === true || r[11] === 'TRUE', scorer: r[12], auto: r[13], confirmed: r[14] });
  });
  return { focus: prop_('FOCUS', null), replays, games, beats, reviews: readReplayTags_(), refs: refList_() };
}

// ---------- reference games: other players' replays, kept apart from West's ----------
function refList_() {
  return readRows_('RefReplays', REF_HEAD).map(r => ({ id: r[0], date: fmtDate_(r[1]), mode: String(r[2]), players: String(r[3]), follow: String(r[4]), result: String(r[5]),
    fileId: String(r[6]), name: String(r[7]), sizeKB: Number(r[8]) || 0, added: String(r[9]), originalName: String(r[10] || '') }));
}
// payload: { id, date, mode, players, follow, result, originalName, b64 }
function refAdd_(p) {
  if (!p) throw new Error('Missing replay'); checkId_(p.id);
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  let out = null;
  withLock_(() => {
    const have = readRows_('RefReplays', REF_HEAD).find(r => r[0] === p.id);
    if (have) { out = { fileId: have[6], existed: true }; return; }
    if (!p.b64) throw new Error('Missing replay file');
    const bytes = Utilities.base64Decode(String(p.b64));
    if (bytes.length > MAX_REPLAY_BYTES) throw new Error('Replay file too large');
    const name = clip(p.date + ' ' + p.mode + ' ' + p.players + '.replay', 120).replace(/[\\/:*?"<>|]/g, '-');
    const file = subFolder_('REF_FOLDER_ID', REPLAY_FOLDER + ' - Reference').createFile(Utilities.newBlob(bytes, 'application/octet-stream', name));
    appendRows_(sheet_('RefReplays', REF_HEAD), [[p.id, clip(p.date, 10), clip(p.mode, 5), clip(p.players, 120), clip(p.follow, 40), clip(p.result, 12),
      file.getId(), name, Math.round(bytes.length / 1024), new Date(), clip(p.originalName, 120)]], REF_HEAD.length);
    out = { fileId: file.getId(), existed: false };
  });
  return out;
}
function refFile_(id) {
  checkId_(id);
  const r = readRows_('RefReplays', REF_HEAD).find(x => x[0] === id);
  if (!r || !r[6]) throw new Error('Reference replay not found');
  const f = DriveApp.getFileById(String(r[6]));
  return { name: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()), follow: String(r[4]) };
}
function refFollow_(id, follow) {
  checkId_(id);
  withLock_(() => {
    const sh = ss_().getSheetByName('RefReplays'); if (!sh) return;
    const rows = readRows_('RefReplays', REF_HEAD), r = rows.find(x => x[0] === id); if (!r) return;
    r[4] = String(follow || '').slice(0, 40); replaceRows_(sh, id, [r], REF_HEAD.length);
  });
  return true;
}
function refRemove_(id) {
  checkId_(id);
  withLock_(() => {
    const r = readRows_('RefReplays', REF_HEAD).find(x => x[0] === id);
    if (r && r[6]) { try { DriveApp.getFileById(String(r[6])).setTrashed(true); } catch (e) {} }
    const sh = ss_().getSheetByName('RefReplays'); if (sh) replaceRows_(sh, id, [], REF_HEAD.length);
  });
  return true;
}

// ---------- clips and compilations ----------
function clipsGet_() {
  const clips = readRows_('Clips', CLIP_HEAD).map(r => ({ id: r[0], title: String(r[1]), tags: String(r[2]), source: String(r[3]), replayId: String(r[4]), follow: String(r[5]),
    start: Number(r[6]) || 0, end: Number(r[7]) || 0, key: Number(r[8]) || 0, match: String(r[9]), sizeKB: Number(r[11]) || 0, created: String(r[12]) }));
  const comps = readRows_('Compilations', COMP_HEAD).map(r => ({ id: r[0], title: String(r[1]), clipIds: String(r[2]).split(',').filter(Boolean), notes: String(r[3]), updated: String(r[4]) }));
  return { clips, comps };
}
// payload: { title, tags, source, replayId, follow, start, end, key, match, data }  (data = the clip's frames as a JSON string)
function clipAdd_(p) {
  if (!p || typeof p.data !== 'string' || !p.data) throw new Error('Missing clip data');
  if (p.data.length > MAX_CLIP_CHARS) throw new Error('Clip too long');
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n), num = x => Math.round((Number(x) || 0) * 100) / 100;
  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  withLock_(() => {
    const file = subFolder_('CLIP_FOLDER_ID', REPLAY_FOLDER + ' - Clips').createFile(Utilities.newBlob(p.data, 'application/json', id + '.json'));
    appendRows_(sheet_('Clips', CLIP_HEAD), [[id, clip(p.title, 120) || 'Clip', clip(p.tags, 200), p.source === 'ref' ? 'ref' : 'game', clip(p.replayId, 64), clip(p.follow, 40),
      num(p.start), num(p.end), num(p.key), clip(p.match, 160), file.getId(), Math.round(p.data.length / 1024), new Date()]], CLIP_HEAD.length);
  });
  return { id };
}
function clipData_(id) {
  checkId_(id);
  const r = readRows_('Clips', CLIP_HEAD).find(x => x[0] === id);
  if (!r || !r[10]) throw new Error('Clip not found');
  return { data: DriveApp.getFileById(String(r[10])).getBlob().getDataAsString() };
}
function clipUpdate_(id, u) {
  checkId_(id);
  withLock_(() => {
    const sh = ss_().getSheetByName('Clips'); if (!sh) return;
    const r = readRows_('Clips', CLIP_HEAD).find(x => x[0] === id); if (!r) return;
    if (u && u.title !== undefined) r[1] = String(u.title).slice(0, 120) || 'Clip';
    if (u && u.tags !== undefined) r[2] = String(u.tags).slice(0, 200);
    replaceRows_(sh, id, [r], CLIP_HEAD.length);
  });
  return true;
}
function clipRemove_(id) {
  checkId_(id);
  withLock_(() => {
    const r = readRows_('Clips', CLIP_HEAD).find(x => x[0] === id);
    if (r && r[10]) { try { DriveApp.getFileById(String(r[10])).setTrashed(true); } catch (e) {} }
    const sh = ss_().getSheetByName('Clips'); if (sh) replaceRows_(sh, id, [], CLIP_HEAD.length);
    // take it out of every compilation
    const cs = ss_().getSheetByName('Compilations');
    if (cs) readRows_('Compilations', COMP_HEAD).forEach(c => {
      const ids = String(c[2]).split(',').filter(Boolean);
      if (ids.indexOf(id) >= 0) { c[2] = ids.filter(x => x !== id).join(','); c[4] = new Date(); replaceRows_(cs, c[0], [c], COMP_HEAD.length); }
    });
  });
  return true;
}
// payload: { id (optional), title, clipIds, notes }
function compSave_(c) {
  if (!c) throw new Error('Missing compilation');
  const id = c.id ? String(c.id) : Utilities.getUuid().replace(/-/g, '').slice(0, 16); checkId_(id);
  const ids = (Array.isArray(c.clipIds) ? c.clipIds : []).map(String).filter(x => /^[A-Za-z0-9_-]{6,64}$/.test(x)).slice(0, 200);
  withLock_(() => replaceRows_(sheet_('Compilations', COMP_HEAD), id, [[id, String(c.title || 'Compilation').slice(0, 120), ids.join(','), String(c.notes || '').slice(0, 500), new Date()]], COMP_HEAD.length));
  return { id };
}
function compRemove_(id) {
  checkId_(id);
  withLock_(() => { const sh = ss_().getSheetByName('Compilations'); if (sh) replaceRows_(sh, id, [], COMP_HEAD.length); });
  return true;
}

// payload: { game, beats, fileName, b64 }  (b64 optional when the file is already stored)
function libAdd_(p) {
  if (!p || !p.game) throw new Error('Missing game');
  const g = p.game; checkId_(g.id);
  const now = new Date(), clip = (s, n) => String(s == null ? '' : s).slice(0, n), num = x => Number(x) || 0;
  let fileId = '', existed = false;
  withLock_(() => {
    const lib = sheet_('Replays', LIB_HEAD);
    const have = readRows_('Replays', LIB_HEAD).find(r => r[0] === g.id);
    if (have) { existed = true; fileId = have[5]; }
    else if (p.b64) {
      const bytes = Utilities.base64Decode(String(p.b64));
      if (bytes.length > MAX_REPLAY_BYTES) throw new Error('Replay file too large');
      const name = clip(p.fileName || (g.date + ' ' + g.mode + ' vs ' + g.opponent + ' (' + g.result + ' ' + g.goalsFor + '-' + g.goalsAgainst + ').replay'), 120).replace(/[\\/:*?"<>|]/g, '-');
      const file = replayFolder_().createFile(Utilities.newBlob(bytes, 'application/octet-stream', name));
      fileId = file.getId();
      if (!lib.getRange(1, LIB_HEAD.length).getValue()) lib.getRange(1, LIB_HEAD.length).setValue(LIB_HEAD[LIB_HEAD.length - 1]).setFontWeight('bold');
      appendRows_(lib, [[g.id, clip(g.date, 10), clip(g.mode, 5), clip(g.opponent, 80), clip(g.result + ' ' + num(g.goalsFor) + '-' + num(g.goalsAgainst), 12), fileId, name, Math.round(bytes.length / 1024), now, clip(p.originalName, 120)]], LIB_HEAD.length);
    }
    replaceRows_(sheet_('Games', GAME_HEAD), g.id, [[g.id, clip(g.date, 10), clip(g.mode, 5), clip(g.opponent, 80), clip(g.result, 2), num(g.goalsFor), num(g.goalsAgainst), num(g.playSeconds),
      num(g.behindPct), num(g.defPct), num(g.midPct), num(g.attPct), num(g.avgBoost), num(g.emptyBoostPct), (p.beats || []).length, num(g.analysisVersion), now]], GAME_HEAD.length);
    // keep causes West already confirmed when the analysis is re-run
    const prev = {}; readRows_('BeatMoments', BEAT_HEAD).filter(r => r[0] === g.id).forEach(r => { prev[Number(r[2])] = r[14]; });
    const beats = (p.beats || []).slice(0, 40).map(b => Object.assign({}, b, { confirmed: b.confirmed || prev[Number(b.n)] || '' }));
    replaceRows_(sheet_('BeatMoments', BEAT_HEAD), g.id, beats.map(b => beatRow_(g, b, now)), BEAT_HEAD.length);
    // full data layer: one row per player per game, one row per moment (columns grow as the engine adds facts)
    if (p.tables) Object.keys(TABLES).forEach(name => { if (Array.isArray(p.tables[name])) writeObjects_(name, g.id, p.tables[name]); });
  });
  return { fileId, existed };
}

// Tabs written from the browser's data engine. Columns come from the data, so new facts appear as new columns.
const TABLES = { GameStats: 50, Moments: 600 };   // max rows per replay
function writeObjects_(name, id, objs) {
  objs = objs.slice(0, TABLES[name]);
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange('A:A').setNumberFormat('@'); }
  let head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].filter(String) : [];
  if (!head.length) head = ['Replay ID'];
  const keys = [];
  objs.forEach(o => Object.keys(o).forEach(k => { if (k !== 'Replay ID' && keys.indexOf(k) < 0) keys.push(k); }));
  const missing = keys.filter(k => head.indexOf(k) < 0).map(k => String(k).slice(0, 60));
  if (missing.length || sh.getLastRow() === 0) {
    head = head.concat(missing);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  const clean = v => (v === null || v === undefined) ? '' : (typeof v === 'boolean' || typeof v === 'number') ? v : String(v).slice(0, 200);
  const rows = objs.map(o => head.map((h, c) => c === 0 ? String(id) : clean(o[h])));
  replaceRows_(sh, id, rows, head.length);
}

function libSaveBeats_(id, beats) {
  checkId_(id);
  const g = readRows_('Games', GAME_HEAD).find(r => r[0] === id);
  if (!g) throw new Error('Game not in library');
  const now = new Date(), game = { id, date: fmtDate_(g[1]) };
  withLock_(() => replaceRows_(sheet_('BeatMoments', BEAT_HEAD), id, (beats || []).slice(0, 40).map(b => beatRow_(game, b, now)), BEAT_HEAD.length));
  return true;
}

function libFile_(id) {
  checkId_(id);
  const r = readRows_('Replays', LIB_HEAD).find(x => x[0] === id);
  if (!r || !r[5]) throw new Error('Replay not in library');
  const f = DriveApp.getFileById(String(r[5]));
  return { name: f.getName(), b64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

function libRemove_(id) {
  checkId_(id);
  withLock_(() => {
    const r = readRows_('Replays', LIB_HEAD).find(x => x[0] === id);
    if (r && r[5]) { try { DriveApp.getFileById(String(r[5])).setTrashed(true); } catch (e) {} }
    [['Replays', LIB_HEAD], ['Games', GAME_HEAD], ['BeatMoments', BEAT_HEAD], ['ReplayTags', R_HEAD]].forEach(([name, head]) => {
      const sh = ss_().getSheetByName(name); if (sh) replaceRows_(sh, id, [], head.length);
    });
    Object.keys(TABLES).forEach(name => { const sh = ss_().getSheetByName(name); if (sh && sh.getLastColumn()) replaceRows_(sh, id, [], sh.getLastColumn()); });
  });
  return true;
}

// ---------- Trends page: everything it needs in one call ----------
const TREND_TYPES = ['Kickoff approach', 'Goal'];
const TREND_COLS = ['Replay ID', 'Match date', 'Match time', 'Type', 'Game clock', 'Replay time (s)', 'Player', 'Team', 'Is West', 'West team', 'Outcome',
  'Other player', 'Spawn', 'Kickoff choice', 'Possession after', 'Kickoff goal', 'Flipped', 'Boost used', 'Ball in his half after 1s', 'Goal-side after 3s',
  'Got boost within 3s', 'Speed (km/h)', 'Boost', 'Attack started', 'Attack seconds', 'Attack touches', 'Shot distance (m)', 'Shot in the air',
  'Defender goal-side', 'Defender distance to goal (m)', 'Defender boost', 'Shot speed (km/h)', 'Engine version'];
function libTrends_() {
  const moments = readObjects_('Moments').filter(o => TREND_TYPES.indexOf(o.Type) >= 0).map(o => { const x = {}; TREND_COLS.forEach(k => { if (o[k] !== undefined && o[k] !== '') x[k] = o[k]; }); return x; });
  const stats = getStats_();
  return { focus: prop_('FOCUS', null), games: readObjects_('Games'), gameStats: readObjects_('GameStats'), moments, mmr: stats ? stats.hist : {} };
}
function readObjects_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2 || !sh.getLastColumn()) return [];
  const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = v[0];
  return v.slice(1).filter(r => r[0] !== '' && r[0] != null).map(r => {
    const o = {}; head.forEach((h, i) => { if (h) o[h] = r[i] instanceof Date ? (h === 'Match date' ? fmtDate_(r[i]) : r[i].toISOString()) : r[i]; });
    o['Replay ID'] = String(o['Replay ID']); return o;
  });
}

// ---------- helpers ----------
function checkId_(id) { if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''))) throw new Error('Bad replay id'); }
function replayFolder_() {
  const id = P().getProperty('REPLAY_FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(REPLAY_FOLDER);
  P().setProperty('REPLAY_FOLDER_ID', f.getId());
  return f;
}
function subFolder_(prop, name) {
  const id = P().getProperty(prop);
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(name);
  P().setProperty(prop, f.getId());
  return f;
}
function beatRow_(g, b, now) {
  const num = x => Number(x) || 0, clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  return [String(g.id), clip(g.date, 10), num(b.n), num(b.goalClock), num(b.beatClock), num(b.secsBefore), num(b.distBall), num(b.distGoal),
    num(b.boost), num(b.speed), !!b.jumped, !!b.retreating, clip(b.scorer, 40), clip(b.auto, 20), clip(b.confirmed, 20), now];
}
function readRows_(name, head) {
  const sh = ss_().getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().filter(r => r[0] !== '' && r[0] != null).map(r => { r[0] = String(r[0]); return r; });
}
function appendRows_(sh, rows, width) {
  if (!rows.length) return;
  const start = Math.max(sh.getLastRow(), 1) + 1;
  sh.getRange(start, 1, rows.length, 1).setNumberFormat('@');
  sh.getRange(start, 1, rows.length, width).setValues(rows);
}
// replace every row for one replay id with new rows (rows may be empty = delete)
function replaceRows_(sh, id, rows, width) {
  const n = sh.getLastRow();
  if (n >= 2) {
    const all = sh.getRange(2, 1, n - 1, width).getValues();
    const keep = all.filter(row => String(row[0]) !== String(id) && row[0] !== '');
    if (keep.length !== all.length) {
      sh.getRange(2, 1, n - 1, width).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, width).setValues(keep);
    }
  }
  appendRows_(sh, rows, width);
}
function readReplayTags_() {
  const byId = {};
  readRows_('ReplayTags', R_HEAD).forEach(row => {
    const id = row[0];
    const r = byId[id] || (byId[id] = { id, date: fmtDate_(row[1]), mode: String(row[2]), opponent: String(row[3]), result: String(row[4]), tags: [] });
    let snap = null; try { snap = row[9] ? JSON.parse(row[9]) : null; } catch (e) {}
    r.tags.push({ clock: String(row[5]), t: Number(row[6]) || 0, cat: String(row[7]), note: String(row[8]), snap });
  });
  return Object.keys(byId).map(k => byId[k]);
}
function fmtDate_(v) { return v instanceof Date ? Utilities.formatDate(v, 'Europe/Berlin', 'yyyy-MM-dd') : String(v || ''); }
