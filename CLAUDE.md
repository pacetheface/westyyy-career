# Westyyy Career Mode: handoff for new sessions

Read this first, then `docs/replay-lab-notes.md` for findings, definitions and open decisions.

## Who and what
- Ryan (repo owner, GitHub `pacetheface`) is building this for his son **West** ("westyyy", Epic name `westyyy -_-`), a Rocket League player. 1v1 peak Diamond II, 2v2 Champion III; season goal GC2 in 2s. Focus is 1v1 and 2v2, not 3v3.
- **Career Mode** (`index.html`): gamified progress tracker (rank goals, daily quests, check-ins, Pro Path, stream goals, skill tree).
- **Replay Lab** (`replay/`): 3D replay viewer plus Trends reports, all built from West's `.replay` files.
- Live site: https://pacetheface.github.io/westyyy-career/ and https://pacetheface.github.io/westyyy-career/replay/

## How Ryan works (important)
- Discuss ideas first; **don't build until he says so** ("Go"). He often asks for analysis only, and that means no code changes.
- Data must be **neutral facts**, not good/bad labels, scores or ratings. Analyse first, decide what matters, then decide how to show it. West's own interaction (reviewing, tagging, predicting) must be part of it.
- No made-up jargon in reports. Use plain facts ("ball went over his head"), not invented situation names.
- Wants side-by-side comparisons, numbered next steps, and the reasoning behind recommendations.
- Everyone (West, Ryan, coaches) sees everything; no coach-only views needed.

## Architecture
| Piece | Where | Notes |
|---|---|---|
| Pages | GitHub Pages, this repo, `main` branch | Static HTML/JS, no build step |
| Backend | Google Apps Script web app: `backend/Code.gs` + `backend/Replay.gs` (two files, one project) | POST `{action, args, code}`; `code` is the family code (stored in the browser's localStorage `familyCode`) |
| API URL | `https://script.google.com/macros/s/AKfycbz8Bgoqpp9JFoaRAn_3ZkCS5ncOvW7BxsVJ_Ql6g6MIE0lRTCiiQfqRKiFW3Al4RQ3P9Q/exec` | Same deployment for Career Mode and Replay Lab |
| Data | Google Sheet `1Epm62GiqbEFfjQMROd-Yix6_pKwzF_4DV9vhf9paoFI` | Tabs: Journal, CoachNotes, Stats, Replays, Games, BeatMoments, ReplayTags, GameStats, Moments, RefReplays, Clips, Compilations |
| Replay files | Google Drive folder "Westyyy Replay Lab" (`1GLzflJ085pZPxTys915TVk3PCeGZVaxq`) | West's replays. Reference games and clips go in sub-folders "Westyyy Replay Lab - Reference" / "- Clips" (ids in script properties `REF_FOLDER_ID`, `CLIP_FOLDER_ID`, created on first use) |

**Secrets:** the real family code, coach PIN hash and refresh key live **only** in the deployed Apps Script copy. The repo has `SET_IN_APPS_SCRIPT_ONLY` placeholders. Never commit them.

### Backend actions
- `Code.gs` `ACTIONS`: Career Mode actions plus `replay: (...a) => replayAction(...a)`. All Replay Lab calls go through `replay`.
- `Replay.gs` `replayAction(name, ...args)`: `library` (also returns `refs`), `add`, `file`, `saveBeats`, `remove`, `trends`; reference games `refAdd`, `refFile`, `refRemove`, `refFollow`; clips `clips`, `clipAdd`, `clipData`, `clipUpdate`, `clipRemove`, `compSave`, `compRemove`.
- `writeObjects_` grows Sheet columns automatically when the engine adds facts (GameStats max 50 rows/game, Moments max 600).
- Google Sheets turns game clocks like `4:16` into times of day (`1899-12-30T…`); `trends.js` `clockOf()` converts back.

### Replay Lab code (`replay/`)
| File | Role |
|---|---|
| `core.js` | `parseReplay(bytes)`: subtr-actor WASM → compact match (t, clock, ball, ballVel, players with track/vel/boost/boosting/act bitmask 1 jump · 2 double jump · 4 dodge, touches, pickups, demos, moments) |
| `moments.js` | Data engine (`ENGINE_VERSION = 3`): neutral per-player moments + numbers; `buildData(M)`, `toTables(M, D, westIdx, info)` |
| `analysis.js` | Game stats + beat moments; `ANALYSIS_VERSION = 100 + ENGINE_VERSION` (103) |
| `trends.js` | Trends view: Kickoffs + Goals reports (1v1), timeline with 5-game average and MMR, "What's changing" (switches on at 15 games, `MIN_GAMES_FOR_TRENDS`) |
| `clips.js` | `cutClip(M, start, end, follow)` cuts a stand-alone mini match (saved as JSON in Drive, plays without the original replay); `renderClips()` draws the Clips view |
| `index.html` | Viewer (three.js 0.160.0 via importmap from jsdelivr), library, tags, batch import, clip player, Replays/Trends switch |
| `vendor/subtr-actor/` | subtr-actor 1.4.0 WASM (MIT); `parse_replay` also gives raw network frames (used for DodgeTorque) |

- Coordinates: RL (x, y, z) → three.js (x, z, y); quaternion (-qx, -qz, -qy, qw). RL world is left-handed: for team 0 (facing +y), +x is the player's **left**.
- Viewer constants: `LEAD = 5` (clips start 5 s early), `TRAIL_SECS = 10` (car trails), `SUPERSONIC = 2200`.
- Stored games recalculate when the engine version changes (opened in the viewer, or in batch via the browser: import core/analysis/moments, then `api('replay','add',{game, beats, tables, originalName})` per replay **without** `b64`).

## Workflow
1. Branch from `main`, commit with the attribution trailers, `git push -u origin <branch>`.
2. Open the PR with `gh api repos/pacetheface/westyyy-career/pulls` (GraphQL is blocked here).
3. Ryan merges. If `backend/*.gs` changed, he first pastes the file into Apps Script, saves, then Deploy → Manage deployments → Edit → **New version** → Deploy.
4. After a merge, users reload with Cmd+Shift+R (GitHub Pages caching).
5. Test locally: serve the repo on `localhost`, route three.js/fonts in Playwright, and mock `script.google.com`.
6. Real-data analysis: the built-in browser pane on Ryan's computer has the family code in localStorage, so scripts on the live Replay Lab page can call the API, fetch replays from Drive, and parse them. Long jobs: run in the background on `window.__x` and poll (45 s per call).

- Reference games: a replay without `westyyy` asks whose view to follow and is saved as a reference game (`isRef`). Reference games and clips never write tags, beats, Games/GameStats rows or Trends data.
- Hash routes: `#games`, `#trends`, `#clips`, `#reference`, `#game=<id>`.

## Status (2026-10-30)
- Built (PR after #13): sidebar in both pages; reference games, saved clips, compilations that play as one reel.
- Merged and live: Trends (Kickoffs, Goals, clip player), clock fix, connection-wait fix, 10-second car trails, rocket-car favicon.
- Analysis only, **not built** (Ryan not ready): kickoff jump timing and car height, flip type and direction, dives, challenge-or-hold.
- Next per Ryan and Claude's agreed order: (1) get replays uploading automatically from West's PC, (2) this handoff, (3) design (not code) a sidebar layout, (4) decide what goes in Trends, (5) build.
