# Replay Lab: findings, definitions and open decisions

Summary of the work up to 2026-10-29. Numbers come from West's 8 saved 1v1 games (June–October 2026) unless noted, plus 1 twos game. Small samples: treat everything as patterns to watch, not proof.

## Goals

| | West scores | Opponents score on West |
|---|---|---|
| Goals (8 games) | 46 | 37 |
| From kickoffs | 8 (17%) | 14 (38%) |
| Long shots (over 40 m) | 59% | 54% |
| In the air | 50% | 32% |

- Most of West's goals come within 1–2 touches, often long shots with the defender out of position.
- The biggest leak is kickoffs: 38% of goals against start there.

## Kickoffs (86 in 1v1)

**Definitions**
- Spawn: |x| > 1500 = Diagonal, > 100 = Off-centre, else Back-centre. Left/right as West sees it facing the ball. *Still to confirm with Ryan:* MOZZASTIQUE44 at 4:22 should be "Diagonal left".
- What he did: within 4 m of the ball at the first touch = **Went for it**; moved forward less than 5 m, or never closer than 25 m = **Fake** (usually: peel back on a diagonal, grab boost, then take it); otherwise = **Hesitated**.
- Possession: which side touches next, more than 0.6 s and less than 5 s after the kickoff touch.
- Kickoff goal: within 10 s (1v1) or 6 s (team modes) of the kickoff touch.

**Findings**
- His side got the ball next on 55% of kickoffs. He faked 23 times, almost all on diagonals, and his side got the ball 61% of those times.
- Off-centre left: 19 kickoffs, his side got the ball 42% of the time, +3 / −6 kickoff goals.
- When both players go for it (51 kickoffs): opponents' final jump is about 0.20 s before contact from about 6 m; West's is about 0.14 s from about 5 m. Opponent car higher at contact on average (80 cm against 66 cm).
- When West's car was higher at contact, his side got the ball 4 of 4 times. When he jumped 0.05 s or less before contact (or not at all), it lost 5 of 5.
- The ball went back over West, toward his goal and more than 4 m up, 10 times: 7 lost, 5 kickoff goals against (of 9 in contested kickoffs).
- Coaching takeaway: jump about 1 m earlier (about 6 m out), and flip into the ball.

**Flips** (read from the replay's own DodgeTorque record)
- Last flip before contact, his side got the ball: forward diagonal 5/7, in-between diagonal 7/12, almost sideways 9/16, **no flip 7/16**.
- Across both players, no flip was worst (39%, 8 of 14 kickoff goals against). The flip type itself made no clear difference.
- West flips **right** on every approach (51/51) and on 45 of 51 final flips, whatever side he spawns on. Opponents go left about 40% of the time.

Clips (ball went over him): MOZZASTIQUE44 4:22, eMakoah 4:25, zizenmann. 2:50 and 1:01, MistruX. 2:50, fiutmilata 4:22 and 1:52. These are scoreboard clocks.

## Dives (analysis only, not built)

Times in this section are Replay Lab timeline times (counting up), not scoreboard clocks.

**Definition used:** jump at the ball from 20 m or less, near top speed (70 km/h or more), getting within 6 m. Kickoffs excluded. "Missed" means no touch by him was recorded.

| 1v1 | West | Opponents |
|---|---|---|
| Dives | 58 | 73 |
| Missed | 25 (43%) | 43 (59%) |
| Missed, then goal against within 10 s | 8 | 13 |

- West doesn't dive or miss more than his opponents, but his misses are expensive: 8 of 25 were followed by a goal against, against 3 of 33 hits. 15 of his misses were in his own third.
- From 8–13 m he missed 13/23. From 13–21 m only 5/19. Jump-only dives missed 8/12.
- Example Ryan flagged: **Ieaner 1:38–1:39**. Full boost in his own half, top speed, jumps from about 19 m, flips, misses a ball 3 m up, goal against.

**Ryan's note:** a dive should at least produce a **50/50**. A challenge that misses ball and opponent entirely is a **"clean beat"**. Next time, split dives into: won it / 50/50 (both touch within a fraction of a second) / clean beat.

## Challenge or hold (analysis only, not built)

**Situation:** an opponent touches the ball in West's half (or just past halfway), West is the closest defender, goal-side, 5–30 m away. **Challenged** = within 2 s he jumps at the ball or drives to within 3 m; otherwise **held back**. Outcome over the next 10 s.

| 1v1 (72 plays) | Plays | Goal against | His side got the ball first |
|---|---|---|---|
| Challenged | 39 | 6 (15%) | 19 (49%) |
| …touched it | 28 | 2 (7%) | 16 |
| …missed | 11 | 4 (36%) | 3 |
| Held back | 33 | 10 (30%) | 14 (42%) |

- Ryan's "75% it works, accept the 25%": West touched the ball on 72% of his challenges.
- In his own third: challenged 15, goal against 2; held 13, goal against 5.
- Caveat: holding back isn't always a choice (sometimes he's too far or too slow), so this flatters challenging.
- Twos: only 3 plays in 1 game, so no conclusion. Ryan's cue is mostly in twos (West dives, the teammate is left on a 2-on-1). This needs 10–15 twos replays and a teammate-distance check.

## Decisions so far
- Replay Lab = Replays (3D viewer) + Trends, visible to everyone. 1v1 first, twos later (West, teammate, opponents).
- Trends: all games plus a Recent comparison (last 5/10/20/since focus, default 10), switching on at 15 games. Every number plays clips starting 5 s before. Timeline with a 5-game average and MMR.
- Layout: Ryan likes a **sidebar navigation** like DataCoach (Home, Replays, Trends, Clips, Career Mode), with our own look, no scores or ratings, the sidebar collapsing for the viewer, and a phone layout. Design first, no code yet.
- DataCoach (datacoach.gg) noted as a comparable product. Its automatic desktop uploader is the main thing worth learning from. Optional test: upload the same 8 games on its free tier and compare.

## Open items
1. Automatic replay upload from West's PC (most important: more games make every report meaningful).
2. Confirm the left/right spawn orientation (MOZZASTIQUE44 4:22).
3. Agree definitions for dives (won / 50/50 / clean beat) and challenge-or-hold by watching clips together.
4. Sidebar design mock-up (Home, Trends, viewer; desktop and phone).
5. Twos reports once there are 10–15 twos games.
6. Later ideas: pause-and-predict in the viewer; replay mistakes as playable drills (RLBot / BakkesMod, separate repo `westyyy-rl-trainer`).
