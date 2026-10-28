// Replay Lab: turns a Rocket League .replay file into the compact match format the 3D viewer plays.
// Parsing runs in the browser through subtr-actor (WebAssembly); nothing is uploaded.
import init, * as sa from './vendor/subtr-actor/rl_replay_subtr_actor.js';

let ready = null;
export function initParser() {
  return ready || (ready = init({ module_or_path: new URL('./vendor/subtr-actor/rl_replay_subtr_actor_bg.wasm', import.meta.url) }));
}

// wasm returns nested Maps; turn them into plain objects
const conv = v => v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, conv(x)]))
  : Array.isArray(v) ? v.map(conv) : (typeof v === 'bigint' ? Number(v) : v);

export async function parseReplay(bytes) {
  await initParser();
  return convert(conv(sa.get_replay_frames_data(bytes)));
}

const idKey = id => JSON.stringify(id);
const r1000 = x => Math.round(x * 1000);
function packRB(fr) {
  const rb = fr && fr.Data && fr.Data.rigid_body;
  if (!rb || !rb.location) return 0;
  const L = rb.location, q = rb.rotation || { x: 0, y: 0, z: 0, w: 1 };
  return [Math.round(L.x), Math.round(L.y), Math.round(L.z), r1000(q.x), r1000(q.y), r1000(q.z), r1000(q.w)];
}

function packVel(fr) {
  const v = fr && fr.Data && fr.Data.rigid_body && fr.Data.rigid_body.linear_velocity;
  return v ? [Math.round(v.x), Math.round(v.y), Math.round(v.z)] : 0;
}

export function convert(d) {
  const H = Object.fromEntries(d.meta.all_headers || []);
  const md = d.frame_data.metadata_frames;
  const N = md.length, t0 = md[0].time;
  const t = md.map(f => Math.round((f.time - t0) * 1000) / 1000);
  const clock = md.map(f => f.seconds_remaining);

  // players: meta has names, teams and camera settings; frame_data has the per-frame tracks
  const metaPlayers = [...(d.meta.team_zero || []).map(p => [p, 0]), ...(d.meta.team_one || []).map(p => [p, 1])];
  const nameOf = {}, teamOf = {};
  metaPlayers.forEach(([p, team]) => { nameOf[idKey(p.remote_id)] = p.name; teamOf[idKey(p.remote_id)] = team; });
  const camEvents = {};
  (d.player_camera_events || []).forEach(([id, evs]) => { camEvents[idKey(id)] = evs; });

  const players = d.frame_data.players.map(([id, data]) => {
    const k = idKey(id), mp = metaPlayers.find(([p]) => idKey(p.remote_id) === k);
    const fr = data.frames;
    const cs = mp && mp[0].camera_settings;
    let team = teamOf[k];
    if (team === undefined) { const f = fr.find(x => x && x.Data); team = f && f.Data.is_team_0 === false ? 1 : 0; }
    return {
      key: k,
      name: nameOf[k] || (fr.find(x => x && x.Data) || {}).Data?.player_name || 'Player',
      team,
      camera: cs ? { fov: cs.fov, height: cs.height, angle: cs.angle, distance: cs.distance, stiffness: cs.stiffness, swivel: cs.swivel_speed } : null,
      ballcam: (camEvents[k] || []).map(e => [e.frame, !!e.ball_cam_active]),
      track: fr.map(packRB),
      boost: fr.map(f => f && f.Data ? Math.round(f.Data.boost_amount * 100 / 255) : 0),
      boosting: fr.map(f => f && f.Data && f.Data.boost_active ? 1 : 0),
      vel: fr.map(packVel),
      // 1 = jump, 2 = double jump, 4 = dodge (flip) active on that frame
      act: fr.map(f => { const x = f && f.Data; return x ? (x.jump_active ? 1 : 0) | (x.double_jump_active ? 2 : 0) | (x.dodge_active ? 4 : 0) : 0; }),
    };
  }).sort((a, b) => a.team - b.team || a.name.localeCompare(b.name));

  const ball = d.frame_data.ball_data.frames.map(packRB);
  const ballVel = d.frame_data.ball_data.frames.map(packVel);

  // raw events the moment engine builds on
  const touches = (d.touch_events || []).map(e => ({ f: e.frame, team: e.team_is_team_0 ? 0 : 1, dodge: !!e.dodge_contact }));
  const padSize = Object.fromEntries((d.boost_pads || []).map(p => [p.pad_id, p.size === 'Big']));
  const pickups = (d.boost_pad_events || []).filter(e => e.kind && e.kind.PickedUp && e.player)
    .map(e => ({ f: e.frame, key: idKey(e.player), big: !!padSize[e.pad_id] }));
  const demos = (d.demolish_infos || []).map(e => ({
    f: e.frame, attacker: e.attacker ? idKey(e.attacker) : null, victim: e.victim ? idKey(e.victim) : null }));
  const resets = (d.dodge_refreshed_events || []).map(e => ({ f: e.frame, key: idKey(e.player) }));

  // boost pads: position plus every pickup / respawn, so pads disappear like in the game
  const pads = (d.boost_pads || []).map(p => ({ id: p.pad_id, big: p.size === 'Big', x: p.position.x, y: p.position.y, ev: [] }));
  const padIdx = Object.fromEntries(pads.map((p, i) => [p.id, i]));
  (d.boost_pad_events || []).forEach(e => {
    const i = padIdx[e.pad_id]; if (i === undefined) return;
    pads[i].ev.push([e.frame, e.kind === 'Available' ? 1 : 0]);
  });
  pads.forEach(p => p.ev.sort((a, b) => a[0] - b[0]));

  // key moments + scoreboard
  const pname = id => nameOf[idKey(id)] || (id && id.PlayStation && id.PlayStation.name) || '?';
  const moments = [], score = [];
  (d.goal_events || []).forEach(g => {
    moments.push({ f: g.frame, type: 'goal', player: pname(g.player), team: g.scoring_team_is_team_0 ? 0 : 1 });
    score.push([g.frame, 0, g.team_zero_score], [g.frame, 1, g.team_one_score]);
  });
  (d.player_stat_events || []).forEach(e => {
    const type = e.kind === 'Shot' ? 'shot' : e.kind === 'Save' ? 'save' : null; if (!type) return;
    const m = { f: e.frame, type, player: pname(e.player), team: e.is_team_0 ? 0 : 1 };
    if (e.shot && e.shot.ball_speed) m.kmh = Math.round(e.shot.ball_speed * 0.036);   // uu/s (cm/s) -> km/h
    moments.push(m);
  });
  moments.sort((a, b) => a.f - b.f);
  // a shot that becomes a goal within 3 s is shown as the goal only (the goal keeps the shot speed)
  const scoring = (m, g) => g.type === 'goal' && g.player === m.player && t[g.f] - t[m.f] >= 0 && t[g.f] - t[m.f] < 3;
  moments.forEach(m => { if (m.type === 'shot' && m.kmh) { const g = moments.find(x => scoring(m, x)); if (g && !g.kmh) g.kmh = m.kmh; } });
  const clean = moments.filter(m => !(m.type === 'shot' && moments.some(g => scoring(m, g))));

  const s0 = H.Team0Score || 0, s1 = H.Team1Score || 0;
  return {
    id: H.Id || H.MatchGUID || String(H.Date || Date.now()),
    meta: { TeamSize: H.TeamSize || players.length / 2, Team0Score: s0, Team1Score: s1, MapName: H.MapName, Date: H.Date, MatchType: H.MatchType },
    t, clock, ball, ballVel, players, pads, moments: clean, score,
    touches, pickups, demos, resets,
  };
}
