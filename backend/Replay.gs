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
const MAX_REPLAY_BYTES = 15 * 1024 * 1024;

// Run once from the editor so Google asks for Drive permission.
function authorizeReplayLab() {
  Logger.log('Replay folder: ' + replayFolder_().getName() + ' (' + replayFolder_().getId() + ')');
}

// ---------- entry point: Code.gs routes action "replay" here ----------
function replayAction(name, ...args) {
  const fns = { library: libGet_, add: libAdd_, file: libFile_, saveBeats: libSaveBeats_, remove: libRemove_ };
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
  return { focus: prop_('FOCUS', null), replays, games, beats, reviews: readReplayTags_() };
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

// ---------- helpers ----------
function checkId_(id) { if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''))) throw new Error('Bad replay id'); }
function replayFolder_() {
  const id = P().getProperty('REPLAY_FOLDER_ID');
  if (id) { try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {} }
  const f = DriveApp.createFolder(REPLAY_FOLDER);
  P().setProperty('REPLAY_FOLDER_ID', f.getId());
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
