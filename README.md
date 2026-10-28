# Westyyy Career Mode

West's Rocket League progress tracker: rank goals, daily quests, end-of-day check-ins, Pro Path, stream goals and skill tree.

- `index.html` is the page, served by GitHub Pages.
- `replay/` is Replay Lab: open a `.replay` file, watch it in 3D from West's own camera, and tag moments. Parsing runs in the browser (`replay/vendor/subtr-actor`, MIT). Tags are saved through the backend to the `ReplayTags` tab.
- `replay/moments.js` is the data engine: a neutral log of moments for every player (kickoffs, 50/50s, turnovers, clears, ball got past, goals, shots, saves, demos, double commits, flip resets) with the same facts each, plus 37 numbers per player. Stored in the `GameStats` and `Moments` tabs; columns grow as the engine adds facts.
- `replay/analysis.js` turns a replay into game stats (behind-ball %, thirds, boost) and "beat moments" (where West got beat before each goal against, with a proposed cause).
- `backend/Replay.gs` holds the Replay Lab backend: original replays in a "Westyyy Replay Lab" Drive folder, plus `Replays`, `Games`, `BeatMoments` and `ReplayTags` tabs in the Sheet. It is a second script file in the same Apps Script project.
- `backend/Code.gs` is the Google Apps Script that stores data in a Google Sheet. The real family code, coach PIN and refresh key live only in the deployed Apps Script copy, never in this repo.
