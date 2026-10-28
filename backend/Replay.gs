/**
 * Westyyy Career Mode: Replay Lab storage.
 * Add this as a second script file (Replay.gs) in the same Apps Script project as Code.gs.
 *
 * Tab it creates in the Sheet:
 *   ReplayTags  one row per tag West makes while reviewing a replay
 */

const R_HEAD = ['Replay ID', 'Match date', 'Mode', 'Opponent', 'Result', 'Game clock', 'Replay time (s)', 'Category', 'Note', 'Snapshot', 'Saved at'];
const R_MAX_TAGS = 80;

// Replay Lab start-up: Coach's weekly focus plus every reviewed replay with its tags.
function getReplayReviews() {
  return { focus: prop_('FOCUS', null), reviews: readReplayTags_() };
}

// Saves all tags for one replay (replaces that replay's previous tags).
function saveReplayReview(r) {
  if (!r || !/^[A-Za-z0-9_-]{6,64}$/.test(String(r.id || ''))) throw new Error('Bad replay id');
  const clip = (s, n) => String(s == null ? '' : s).slice(0, n);
  const tags = (Array.isArray(r.tags) ? r.tags : []).slice(0, R_MAX_TAGS);
  const now = new Date();
  const rows = tags.map(g => {
    const snap = g.snap ? JSON.stringify(g.snap) : '';
    return [String(r.id), clip(r.date, 10), clip(r.mode, 5), clip(r.opponent, 80), clip(r.result, 12),
      clip(g.clock, 6), Math.max(0, Math.min(3600, Number(g.t) || 0)), clip(g.cat, 40), clip(g.note, 300),
      snap.length <= 3000 ? snap : '', now];
  });
  withLock_(() => {
    const sh = sheet_('ReplayTags', R_HEAD);
    const n = sh.getLastRow();
    if (n >= 2) {
      const all = sh.getRange(2, 1, n - 1, R_HEAD.length).getValues();
      const keep = all.filter(row => String(row[0]) !== String(r.id));
      sh.getRange(2, 1, n - 1, R_HEAD.length).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, R_HEAD.length).setValues(keep);
    }
    if (rows.length) {
      const start = Math.max(sh.getLastRow(), 1) + 1;
      sh.getRange(start, 1, rows.length, 1).setNumberFormat('@');
      sh.getRange(start, 1, rows.length, R_HEAD.length).setValues(rows);
    }
  });
  return true;
}

function readReplayTags_() {
  const sh = ss_().getSheetByName('ReplayTags');
  if (!sh || sh.getLastRow() < 2) return [];
  const byId = {};
  sh.getRange(2, 1, sh.getLastRow() - 1, R_HEAD.length).getValues().forEach(row => {
    const id = String(row[0] || ''); if (!id) return;
    const r = byId[id] || (byId[id] = { id, date: fmtDate_(row[1]), mode: String(row[2]), opponent: String(row[3]), result: String(row[4]), tags: [] });
    let snap = null; try { snap = row[9] ? JSON.parse(row[9]) : null; } catch (e) {}
    r.tags.push({ clock: String(row[5]), t: Number(row[6]) || 0, cat: String(row[7]), note: String(row[8]), snap });
  });
  return Object.keys(byId).map(k => byId[k]);
}

function fmtDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, 'Europe/Berlin', 'yyyy-MM-dd') : String(v || '');
}
