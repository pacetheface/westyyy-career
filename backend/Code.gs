/**
 * Westyyy Career Mode — data backend (Google Apps Script).
 * The page itself lives on GitHub Pages; this script only stores and serves data.
 *
 * Tabs it creates in the Sheet:
 *   Journal     one row per day of West's end-of-day check-ins
 *   CoachNotes  your notes on specific days
 *   Stats       Rocket League stats, written by the nightly refresh
 */

// ===== SETTINGS =====
const SHEET_ID = '1Epm62GiqbEFfjQMROd-Yix6_pKwzF_4DV9vhf9paoFI';
const FAMILY_CODE = 'SET_IN_APPS_SCRIPT_ONLY';
const COACH_PIN_HASH = 'SET_IN_APPS_SCRIPT_ONLY';
const REFRESH_KEY = 'SET_IN_APPS_SCRIPT_ONLY';
const TASK_ID = 'trig_01VLEhtrrssRTW7AeFoMud3y';                       // 'Westyyy refresh button' relay task (starts the stats refresh)
const REFRESH_PER_DAY = 2, REFRESH_GAP_MIN = 30;                       // limits for West's Refresh button
// The scheduled task's API token goes in Project Settings > Script Properties as ROUTINE_TOKEN (never in code).
// ====================

const J_HEAD = ['Date', 'Mood (1-5)', 'What I did', 'Anything else', 'Stream minutes', 'Feelings', 'Did well', 'To fix', 'Saved at'];
const N_HEAD = ['Date', 'Coach note', 'Saved at'];
const P = () => PropertiesService.getScriptProperties();
const ss_ = () => SpreadsheetApp.openById(SHEET_ID);

// ---------- Web API ----------
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'status') {
    const s = getStats_();
    return json_({ ok: true, updated: s ? s.current.updated : null });
  }
  return json_({ ok: true, app: 'Westyyy Career Mode API' });
}

const ACTIONS = { getAll, saveCheckin, saveStream, coachLogin, saveFocus, saveNote, saveSkills, requestRefresh,
  // Replay Lab (functions live in Replay.gs; called lazily so file order doesn't matter)
  getReplayReviews: (...a) => getReplayReviews(...a), saveReplayReview: (...a) => saveReplayReview(...a) };

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Bad request' }); }
  try {
    if (body.action === 'stats') {
      if (body.token !== REFRESH_KEY) return json_({ ok: false, error: 'Bad refresh key' });
      if (!body.current || !body.current.playlists || !body.hist) return json_({ ok: false, error: 'Missing data' });
      withLock_(() => saveStats_(body.current, body.hist));
      return json_({ ok: true });
    }
    if (String(body.code || '').trim().toLowerCase() !== FAMILY_CODE.toLowerCase()) return json_({ ok: false, error: 'Wrong family code', code: 'family' });
    const fn = ACTIONS[body.action];
    if (!fn) return json_({ ok: false, error: 'Unknown action' });
    return json_({ ok: true, result: fn.apply(null, body.args || []) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- Actions ----------
function getAll() {
  return {
    stats: getStats_(),
    journal: readJournal_(),
    notes: readNotes_(),
    focus: prop_('FOCUS', null),
    skills: prop_('SKILLS', {}),
    stream: prop_('STREAM', {}),
    refresh: refreshState_()
  };
}

function saveCheckin(e) {
  if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) throw new Error('Bad date');
  const mood = Math.round(Number(e.mood));
  if (!(mood >= 1 && mood <= 5)) throw new Error('Pick a face first');
  const clip = (s, n) => String(s || '').slice(0, n);
  const list = a => (Array.isArray(a) ? a : []).map(x => clip(x, 40).replace(/,/g, ' ')).slice(0, 20).join(', ');
  const row = [e.date, mood, list(e.did), clip(e.didNote, 200), Math.max(0, Math.min(1440, Number(e.streamMin) || 0)),
    list(e.feel), clip(e.well, 300), clip(e.fix, 300), new Date()];
  withLock_(() => upsert_(sheet_('Journal', J_HEAD), e.date, row));
  return true;
}

function saveStream(s) {
  const v = { followers: Math.max(0, Number(s && s.followers) || 0), avgViewers: Math.max(0, Number(s && s.avgViewers) || 0) };
  P().setProperty('STREAM', JSON.stringify(v));
  return true;
}

function coachLogin(pin) { checkPin_(pin); return true; }

function saveFocus(pin, text) {
  checkPin_(pin);
  P().setProperty('FOCUS', JSON.stringify({ text: String(text || '').slice(0, 120), at: Date.now() }));
  return true;
}

function saveNote(pin, date, text) {
  checkPin_(pin);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Bad date');
  const sh = sheet_('CoachNotes', N_HEAD), t = String(text || '').slice(0, 500);
  withLock_(() => {
    if (t) upsert_(sh, date, [date, t, new Date()]);
    else { const r = findRow_(sh, date); if (r) sh.deleteRow(r); }
  });
  return true;
}

function saveSkills(pin, skills) {
  checkPin_(pin);
  const clean = {};
  Object.keys(skills || {}).slice(0, 50).forEach(k => { if (/^[a-z0-9]{2,20}$/.test(k) && /^\d{4}-\d{2}-\d{2}$/.test(skills[k])) clean[k] = skills[k]; });
  P().setProperty('SKILLS', JSON.stringify(clean));
  return true;
}

// West's Refresh button: starts the stats refresh scheduled task through its API trigger.
function refreshState_() {
  const today = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
  const s = prop_('REFRESH_LOG', { day: today, count: 0, last: 0 });
  if (s.day !== today) { s.day = today; s.count = 0; }
  const next = s.last ? s.last + REFRESH_GAP_MIN * 60000 : 0;
  return { last: s.last, left: Math.max(0, REFRESH_PER_DAY - s.count), nextAt: next > Date.now() ? next : 0, configured: !!P().getProperty('ROUTINE_TOKEN') };
}
function requestRefresh() {
  return withLock_(() => {
    const token = P().getProperty('ROUTINE_TOKEN');
    if (!token) throw new Error('Refresh button isn\'t set up yet (missing token)');
    const st = refreshState_();
    if (st.left <= 0) throw new Error('No refreshes left today. Stats still update tonight.');
    if (st.nextAt) throw new Error('Refresh already running. Try again in ' + Math.ceil((st.nextAt - Date.now()) / 60000) + ' min.');
    const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/claude_code/routines/' + TASK_ID + '/fire', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'Authorization': 'Bearer ' + token, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'experimental-cc-routine-2026-04-01' },
      payload: JSON.stringify({ text: 'Refresh button pressed on the tracker page.' })
    });
    if (res.getResponseCode() !== 200) throw new Error('Could not start the refresh (' + res.getResponseCode() + ')');
    const today = Utilities.formatDate(new Date(), 'Europe/Berlin', 'yyyy-MM-dd');
    const s = prop_('REFRESH_LOG', { day: today, count: 0, last: 0 });
    if (s.day !== today) { s.day = today; s.count = 0; }
    s.count++; s.last = Date.now();
    P().setProperty('REFRESH_LOG', JSON.stringify(s));
    return refreshState_();
  });
}

// Optional: run from the editor to check the Sheet connection.
function setup() {
  Logger.log('Sheet: ' + ss_().getName());
}

// ---------- Helpers ----------
function hash_(pin) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'westyyy:' + pin)); }
function checkPin_(pin) { if (hash_(String(pin || '')) !== COACH_PIN_HASH) throw new Error('Wrong PIN'); }
function prop_(k, d) { const v = P().getProperty(k); try { return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(15000); try { return fn(); } finally { l.releaseLock(); } }

function sheet_(name, head) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (head) { sh.appendRow(head); sh.setFrozenRows(1); sh.getRange('1:1').setFontWeight('bold'); }
    sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}
function findRow_(sh, date) {
  const n = sh.getLastRow(); if (n < 2) return 0;
  const vals = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (vals[i][0] === date) return i + 2;
  return 0;
}
function upsert_(sh, date, row) {
  const r = findRow_(sh, date);
  if (r) sh.getRange(r, 1, 1, row.length).setValues([row]);
  else { sh.appendRow(row); sh.getRange(sh.getLastRow(), 1).setNumberFormat('@').setValue(date); }
}
function readJournal_() {
  const sh = ss_().getSheetByName('Journal');
  if (!sh || sh.getLastRow() < 2) return [];
  const split = s => s ? s.split(', ').filter(Boolean) : [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 8).getDisplayValues()
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r[0]))
    .map(r => ({ date: r[0], mood: Number(r[1]), did: split(r[2]), didNote: r[3], streamMin: Number(r[4]) || 0, feel: split(r[5]), well: r[6], fix: r[7] }));
}
function readNotes_() {
  const sh = ss_().getSheetByName('CoachNotes');
  const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(r => { if (r[0] && r[1]) out[r[0]] = { t: r[1] }; });
  return out;
}
function saveStats_(current, hist) {
  const sh = sheet_('Stats', null);
  sh.clear();
  const rows = [['current', JSON.stringify(current)]];
  Object.keys(hist).forEach(k => rows.push(['hist:' + k, JSON.stringify(hist[k])]));
  sh.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
}
function getStats_() {
  const sh = ss_().getSheetByName('Stats');
  if (!sh || sh.getLastRow() < 1) return null;
  const out = { hist: {} };
  sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(([k, j]) => {
    try {
      if (k === 'current') out.current = JSON.parse(j);
      else if (String(k).indexOf('hist:') === 0) out.hist[String(k).slice(5)] = JSON.parse(j);
    } catch (e) {}
  });
  return out.current ? out : null;
}
