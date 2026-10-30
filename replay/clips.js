// Replay Lab: saved clips and compilations.
// A clip is a few seconds cut out of a match in the same format the viewer plays (see core.js convert),
// so it loads instantly without the original replay.

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// frames [i0, i1] of match M → a stand-alone mini match. follow = index of the player whose view it uses.
export function cutClip(M, start, end, follow) {
  const T = M.t, N = T.length;
  const at = tt => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (T[m] <= tt) lo = m; else hi = m - 1; } return lo; };
  const i0 = at(Math.max(0, start)), i1 = Math.max(i0 + 1, at(Math.min(T[N - 1], end)));
  const sl = a => (a || []).slice(i0, i1 + 1);
  const inRange = e => e.f >= i0 && e.f <= i1, shift = e => Object.assign({}, e, { f: e.f - i0 });
  const t0 = T[i0];
  // state at the first frame becomes an event at frame 0, then the events inside the clip
  const padEv = ev => { let cur = 1; const out = []; for (const [f, v] of ev) { if (f <= i0) cur = v; else if (f <= i1) out.push([f - i0, v]); } return [[0, cur]].concat(out); };
  const camEv = ev => { let cur = true; const out = []; for (const [f, v] of ev) { if (f <= i0) cur = v; else if (f <= i1) out.push([f - i0, v]); } return [[0, cur]].concat(out); };
  const score = [0, 1].map(team => { let v = 0; for (const [f, tm, s] of (M.score || [])) if (tm === team && f <= i0) v = s; return [0, team, v]; })
    .concat((M.score || []).filter(([f]) => f > i0 && f <= i1).map(([f, tm, s]) => [f - i0, tm, s]));
  return {
    id: 'clip', isClip: true, follow,
    meta: Object.assign({}, M.meta),
    t: T.slice(i0, i1 + 1).map(x => Math.round((x - t0) * 1000) / 1000),
    clock: sl(M.clock), ball: sl(M.ball), ballVel: sl(M.ballVel),
    players: M.players.map(p => ({ key: p.key, name: p.name, team: p.team, camera: p.camera, ballcam: camEv(p.ballcam || []),
      track: sl(p.track), boost: sl(p.boost), boosting: sl(p.boosting), vel: sl(p.vel), act: sl(p.act) })),
    pads: (M.pads || []).map(p => ({ id: p.id, big: p.big, x: p.x, y: p.y, ev: padEv(p.ev || []) })),
    moments: (M.moments || []).filter(inRange).map(shift), score,
    touches: (M.touches || []).filter(inRange).map(shift), pickups: (M.pickups || []).filter(inRange).map(shift),
    demos: (M.demos || []).filter(inRange).map(shift), resets: (M.resets || []).filter(inRange).map(shift),
  };
}

const dur = c => Math.max(0, (Number(c.end) || 0) - (Number(c.start) || 0));
const fmtDur = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const badge = c => c.source === 'ref' ? `<span class="cl-b ref">${esc(String(c.follow || 'REF').replace(/\s*-_-\s*/, '').toUpperCase())}</span>` : '<span class="cl-b west">WEST</span>';

// state: { clips, comps, open (compilation id being edited), filter }
export function renderClips(root, data, state, act) {
  const clips = data.clips || [], comps = data.comps || [];
  const byId = Object.fromEntries(clips.map(c => [c.id, c]));
  const f = String(state.filter || '').toLowerCase();
  const shown = clips.filter(c => !f || [c.title, c.tags, c.follow, c.match].join(' ').toLowerCase().includes(f)).slice().reverse();
  const compOpts = comps.map(c => `<option value="${esc(c.id)}">${esc(c.title)}</option>`).join('');
  const compCards = comps.map(c => {
    const list = c.clipIds.map(id => byId[id]).filter(Boolean), total = list.reduce((a, x) => a + dur(x), 0), open = state.open === c.id;
    return `<div class="cl-comp${open ? ' open' : ''}">
      <div class="cl-row">
        <div class="cl-main"><b>${esc(c.title)}</b><span>${list.length} clip${list.length === 1 ? '' : 's'} · ${fmtDur(total)}</span></div>
        <button class="btn primary" type="button" data-act="playComp" data-id="${esc(c.id)}" ${list.length ? '' : 'disabled'}>▶ Play</button>
        <button class="btn" type="button" data-act="toggleComp" data-id="${esc(c.id)}" aria-expanded="${open}">${open ? 'Done' : 'Edit'}</button>
      </div>
      ${open ? `<div class="cl-edit">
        <label class="cl-lbl">Name <input type="text" maxlength="120" value="${esc(c.title)}" data-act="renameComp" data-id="${esc(c.id)}"></label>
        ${list.length ? list.map((x, k) => `<div class="cl-row sm">${badge(x)}<div class="cl-main"><b>${esc(x.title)}</b><span>${esc(x.match || '')} · ${fmtDur(dur(x))}</span></div>
          <button class="btn" type="button" data-act="moveClip" data-id="${esc(c.id)}" data-k="${k}" data-d="-1" ${k === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn" type="button" data-act="moveClip" data-id="${esc(c.id)}" data-k="${k}" data-d="1" ${k === list.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
          <button class="btn" type="button" data-act="dropClip" data-id="${esc(c.id)}" data-k="${k}" aria-label="Take out of this compilation">✕</button></div>`).join('')
        : '<p class="empty">No clips yet. Add them from the list on the right.</p>'}
        <button class="btn" type="button" data-act="removeComp" data-id="${esc(c.id)}" style="color:var(--pink)">Delete compilation</button>
      </div>` : ''}
    </div>`;
  }).join('');
  const clipRows = shown.map(c => `<div class="cl-row">
      ${badge(c)}
      <div class="cl-main"><b>${esc(c.title)}</b><span>${esc(c.match || '')} · ${fmtDur(dur(c))}${c.tags ? ' · ' + esc(c.tags) : ''}</span></div>
      <button class="btn" type="button" data-act="playClip" data-id="${esc(c.id)}" aria-label="Play ${esc(c.title)}">▶</button>
      ${comps.length ? `<select data-act="addTo" data-id="${esc(c.id)}" aria-label="Add to a compilation"><option value="">Add to…</option>${compOpts}</select>` : ''}
      <button class="btn" type="button" data-act="removeClip" data-id="${esc(c.id)}" aria-label="Delete clip" title="Delete clip">×</button>
    </div>`).join('');
  root.innerHTML = `<div class="cl-wrap">
    <div class="cl-head"><div><h2>Clips</h2><p class="sub">Moments cut out of games: West's own and reference games. Put them in a compilation to watch them as one reel. To make a clip, open a game and press <b>✂ Save clip</b>.</p></div></div>
    <div class="cl-cols">
      <section aria-labelledby="clCompT">
        <div class="cl-sh"><h3 id="clCompT">Compilations</h3></div>
        <form class="cl-new" data-act="newComp"><input type="text" maxlength="120" placeholder="New compilation, e.g. Curving in behind the ball" aria-label="New compilation name"><button class="btn" type="submit">Create</button></form>
        ${compCards || '<p class="empty">No compilations yet.</p>'}
      </section>
      <section aria-labelledby="clAllT">
        <div class="cl-sh"><h3 id="clAllT">All clips (${clips.length})</h3><input type="search" placeholder="Search title, tag, player" value="${esc(state.filter || '')}" data-act="filter" aria-label="Search clips"></div>
        ${clipRows || `<p class="empty">${clips.length ? 'No clips match.' : 'No clips yet.'}</p>`}
      </section>
    </div>
  </div>`;
  root.querySelectorAll('[data-act]').forEach(el => {
    const a = el.dataset.act, id = el.dataset.id;
    if (el.tagName === 'FORM') el.onsubmit = e => { e.preventDefault(); const v = el.querySelector('input').value.trim(); if (v) act.newComp(v); };
    else if (a === 'filter') el.oninput = () => { state.filter = el.value; act.redraw(true); };
    else if (a === 'renameComp') el.onchange = () => act.renameComp(id, el.value.trim());
    else if (a === 'addTo') el.onchange = () => { if (el.value) act.addTo(el.value, id); };
    else el.onclick = () => act[a](id, Number(el.dataset.k), Number(el.dataset.d));
  });
  if (state.focusFilter) { const s = root.querySelector('[data-act="filter"]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } state.focusFilter = false; }
}
