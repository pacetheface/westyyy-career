# Westyyy Career Mode

West's Rocket League progress tracker: rank goals, daily quests, end-of-day check-ins, Pro Path, stream goals and skill tree.

- `index.html` is the page, served by GitHub Pages.
- `replay/` is Replay Lab: open a `.replay` file, watch it in 3D from West's own camera, and tag moments. Parsing runs in the browser (`replay/vendor/subtr-actor`, MIT). Tags are saved through the backend to the `ReplayTags` tab.
- `backend/Replay.gs` holds the Replay Lab backend functions. Add it as a second script file in the same Apps Script project.
- `backend/Code.gs` is the Google Apps Script that stores data in a Google Sheet. The real family code, coach PIN and refresh key live only in the deployed Apps Script copy, never in this repo.
