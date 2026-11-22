# Shed World: the Garden, drawn without GL, one write per tap

Daniel picked style C, "Garden", from three mockups (2026-11-22): a
toon-shaded chibi courtyard with ink outlines, chat bubbles over heads, a
"N people can hear you" chip, and faded bubbles from people out of earshot.
He asked that Convex use stay small, that chat be kept 15 minutes plus
anything reported, that rooms hold 20, and that the first release avoid
waiting on a store build where it could.

What we weighed:

- **Drawing it.** The design plan proposed react-three-fiber with `expo-gl`.
  `expo-gl` is native code, so phones would get nothing until a store build,
  the Simulator's GL is unreliable, and three plus R3F add about 1 MB to every
  bundle and over-the-air update. The Garden's look is flat colours, a
  three-step toon ramp and ink lines, from a fixed camera, so it doesn't need
  a GPU. `src/world/camera.ts` projects the courtyard through the same
  perspective camera as the mockup, and the scene is plain React Native views:
  box faces and ground tiles are squares warped into place with a 4×4
  `matrix` transform (`matrix3d` on the web), balls are circles with a lighter
  circle toward the sun, and ink edges are thin rotated views. It runs the
  same on iOS, the web and the Simulator, ships over the air, and adds no
  dependency. The cost: no real shadows or lighting, a camera that doesn't
  move, and a few hundred views. A GL renderer could replace `Garden.tsx`
  later behind `pickView` without touching the backend.
- **What crosses the network.** Only actions: a walk (from, to, start time),
  an emote, a line, and an idle heartbeat. Every phone works out where people
  are from their latest walk (`posAt` in `shared/world.ts`), so a tap is one
  mutation that patches one row, and walking costs nothing per frame. The
  server starts each walk where it says the person is now and clamps the end
  to the courtyard, so nobody can teleport.
- **Who receives what.** Convex re-sends a query's result whenever anything
  it read changes. Each person's walk, emote and line live in their own
  `worldState` row and each phone subscribes to each person's row, so a tap
  pushes one small row instead of the whole room. Heartbeats go to
  `worldPresence`, which no app query reads, so they push nothing. The roster
  changes only on join and leave, and the chat log is read only by the list
  view.
- **Keeping storage bounded.** Rows grow with people present, not with time:
  `worldState` is upserted, a member's rows are deleted when they leave or
  go quiet for 90 seconds, chat lines go after 15 minutes (and past 50 per
  room), and empty rooms are deleted. The sweeper schedules itself every 30
  seconds while anyone is in, stops when the garden is empty, and a daily
  cron restarts it if a run was ever lost. A report copies the room's last
  lines into `worldReports`, which is kept.
- **Rate limits.** Token buckets on each person's own state row (move: burst
  5, one per 3 s; emote: 3, one per 6 s; line: 3, one per 10 s). A turned-away
  action writes nothing and tells the phone when to retry; the phone keeps
  only the latest spot and sends it then. Taps closer than 150 ms send only
  the last.
- **Safety.** Mute is per visit and on the phone. Block is kept
  (`worldBlocks`) and hides both people from each other's roster, states and
  chat. Proximity is a display choice, not privacy: everyone in the room
  receives every line.

## Write budget

Measured by `convex/world.test.ts` ("write budget per player"), ten minutes
of simulated play against the real mutations:

| Player | Mutations a minute | Document writes a minute |
| --- | ---: | ---: |
| Typical: 8 taps, 1 emote, 2 lines | 11 | about 15 |
| At every rate limit | 36 accepted (more are refused, writing nothing) | at most 47 |
| Idle | about 1.3 heartbeats | at most 1.3 |

Join and leave are a handful of writes once per visit, and the sweeper adds
two calls a minute while anyone is in.
