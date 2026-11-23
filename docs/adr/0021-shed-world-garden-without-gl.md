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

## Added the same night: high fives, emotes, a bigger voice, the editor

Daniel asked for four more things (2026-11-22, 11:48pm and 11:51pm), with
Convex use kept as small as before:

- **High fives (and later hugs, fist bumps, dances).** One asks, the other
  accepts within `ASK_MS` (10 s). The ask is an `ask` field on the asker's own
  `worldState` row and the answer a `reply` field on the other's, so each is
  one write and reaches the room through the per-person subscriptions it
  already has: no new table, query or subscription. Both are overwritten by
  the next one, so there's nothing to sweep. Every phone plays the action from
  `reply.at` (`liveMutual` in `shared/world.ts`), so both people slap hands
  at the same moment. Declining writes nothing; the ask runs out. The server
  checks both people are in the room, haven't blocked each other and stand
  within `INTERACT_RADIUS`. A new mutual action is one entry in `MUTUALS`
  plus its animation.
- **Emotes** are twelve ids (`EMOTES`), each a face and a body animation in
  `src/world/Person.tsx` plus an icon. Still one write each, on the same
  bucket as before.
- **The voice** carries `HEAR_RADIUS` = 7.5, up from 5.
- **The character editor** saves one `worldLooks` row per person, written
  once on Save (never while browsing), validated against `LOOK_SIZES` on the
  server, and read by the roster query people already subscribe to. Choices
  grow by appending to the palettes, and `lookFor` keeps the first build's
  ranges, so nobody's default look changed.

## Added the next morning: touch, touching hands, a Mii-style editor, optimism

Daniel's items 5 to 9 (2026-11-23):

- **Touch.** The garden takes the touch with a responder instead of a press,
  so walking starts on touch down and follows the finger while it's held or
  dragged. The local walk follows every move. Writes stay discrete: one move
  at once on touch down, then at most one every 500 ms and only once the
  target has moved 0.5 world units, and one on release only if the spot
  differs; a quick tap is exactly one move. The server's move bucket became
  burst 4, then one per 500 ms, to match. Other phones ease each remote
  person toward their new walk (`useGlide`) so a twice-a-second update
  glides. Nothing is written per frame.
- **High fives touch.** Drawn only, from the accepted event: both step toward
  the midpoint until 1.1 apart, the raised palms meet at one point above their
  heads with a spark, and they step back (`touchK` in `Person.tsx`).
- **Look version 2.** The look gained optional face, eye, brow, nose, mouth,
  height, build, blush, freckles and beard parts, and `v: 2`. Additive on
  `worldLookValidator`, bounds checked by `isValidLook`, defaults for any
  missing part (`lookPart`), so the email look and older apps keep working.
  Height and build change only the drawing (`bodyScale`), never position,
  collisions or hearing. Saving is still one write.
- **Optimistic everywhere.** Emotes, lines, asks, accepts and saved looks use
  Convex optimistic updates, so they show at once on the actor's phone; Convex
  drops each when its mutation answers, so the server's copy replaces it (no
  duplicates) and a refusal rolls it back. A pending chat line is marked by
  its id. Moves were already local.

## Changed in 2.12.10: a review pass and Daniel's next list

- **Touch, revised.** A held or dragged finger is now drawn on the phone only:
  the walk follows it once a frame and nothing is sent until the finger
  lifts, when one move goes out. The 500 ms sends while dragging are gone,
  so a long drag costs one write and other phones see the walk once it's
  settled.
- **Walking is drawn from a gait** (`src/world/gait.ts`): the stride starts
  at zero and fades out after arriving, a heading eases over 180 ms and is
  kept after stopping (nobody turns back to the camera), and a walk that goes
  nowhere keeps the heading. The server's answer to a tap is blended into
  the local walk (`blendIn` in `useWorld.ts`) instead of replacing it, which
  used to step you back by the round trip. Remote glide offsets are set in a
  layout effect, so the first frame of a new walk is already eased.
- **Tapping someone opens a HUD over them** (`PersonHud.tsx`), not a sheet.
  High five walks you beside them first (`approach.ts`) and asks on arrival.
  Mute, block and report stay in the sheet, behind More.
- **The arcade is a place you stay.** Tapping it walks you there, then opens
  Games with the Garden screen still mounted and joined. `worldState.away`
  (one write to set, one to clear, cleared by any move) shows you faded with
  "Playing" to everyone else, and asks to you are refused meanwhile.
- **Emotes.** The tray offers six (`EMOTE_TRAY`); all twelve ids stay valid
  for older apps. The act bucket refills every 4 s (was 6 s) so an emote can
  follow the last one, and the app keeps its own copy of the bucket so a
  refused emote is never shown and then taken back.
- **Outfits.** `outfit` is one more optional look part (dress, skirt,
  overalls, striped tee, hoodie), additive like version 2's parts.
- **Offline list and pokes.** `worldVisitors` keeps each person's name and
  when they were last in the garden (written on join and on leaving, deleted
  with the account). `world.offline` lists the latest 30 who aren't here and
  haven't blocked you or been blocked. `world.poke` sends an in-app
  notification and a push linking to `/world`: one poke an hour per sender,
  and nobody is poked more than once in ten minutes.

## Look version 3 and everyone on the poke list

- **Look version 3.** Nineteen more optional look parts, still one small
  object and one write on Save: Mii-style placement sliders for the eyes,
  brows and mouth (`eyeY`, `eyeGap`, `eyeSize`, `eyeTilt`, `browY`,
  `browGap`, `browSize`, `browTilt`, `mouthY`, `mouthSize`, `mouthTilt`),
  `browColour`, `glasses`, `eyeshadow`, `lipstick`, `mole`, `pants`,
  `pantsColour` and `favourite`. Every slider has seven steps and its
  middle step is where the part was drawn before, so a missing slider draws
  the old face. The existing palettes grew by appending (hairstyles, hair
  colours, skin tones, hats, extras, eyes, mouths, blush, freckles, facial
  hair, tops). `isValidLook` bounds every part on the server and accepts
  versions 1 to 3.
- **A newer look on an older app.** `lookPart` treats a choice outside this
  app's range as the default, and unknown fields are ignored, so an older
  app draws a newer look with the parts it knows.
- **Glasses got their own part.** They were extra number 1, so glasses and
  a backpack couldn't go together. A missing `glasses` still means round
  glasses when the extra is 1; the editor moves them across when it opens
  and no longer offers that extra.
- **Brows follow the eyes.** The brow sliders are offsets from the eyes, so
  moving the eyes carries the brows with them and the two can't collide.
- **The poke list is everyone on staff.** `world.offlineStaff` pages through
  this staff year's profiles by name (`staffProfiles.by_year_and_name`),
  leaving out the caller, anyone in the world and anyone blocked either way.
  A page reads at most 50 profiles and can come back shorter than asked when
  it skipped people; the app keeps loading with "Load more" until it's done.
  `world.pokeStaff` pokes by staff profile, so people who have never been in
  the world can be invited, with the same limits as `world.poke`. Someone
  never seen has no `worldVisitors` row, so their ten-minute gap is kept in
  `worldPoked` instead. `world.offline` and `world.poke` stay for older
  apps.
- **One online count.** `world.onlineCount` adds up `memberCount` on the
  rooms (`worldRooms`, read by index, at most 500 rooms), the same presence
  the world draws from, so it moves with joins, travel, leaves and the
  sweeper. It reads a handful of small rows instead of every member, and
  one subscription serves the side menu, the Games list card and the People
  button badge (`useWorldOnline`). It's 0 when signed out, and the app shows
  nothing at 0.

## Places

There are five places (`PLACES` in `shared/world.ts`), joined by pads
(`PORTALS`) the way Daniel laid them out: the Garden leads to the Beach (at
the gate), the Campfire and the Chapel; the Beach to the Campfire; the
Campfire to the Café; the Café to the Chapel. Every pad has one going back,
so the five make a loop with the Garden to Campfire path across it.

- **Same floor everywhere.** Every place uses the Garden's walkable outline
  and camera, so the camera, taps, clamping and the narrow-phone fit are
  shared. Only the furniture differs (`PLACE_OBSTACLES`), and `clampTarget`
  takes the place.
- **Rooms already had a place.** `worldRooms.place` was always there; rooms
  are now found per place, each with its own instances and cap.
  `worldMembers.place` (optional, missing means the Garden) saves `move` a
  read of the room.
- **Travel is one mutation.** `world.travel` moves the member row to a room
  of the target place, fixes both rooms' counts (closing the old one if it
  empties), puts the walk beside the pad that leads back (`arrivalSpot`),
  and clears any open ask. It spends an act token and keeps the member id,
  so the app only swaps its room. The server does not check that you stood
  on a pad: changing rooms gains nothing, and the list view travels from a
  button.
- **Pads are an app rule.** The app travels when your own walk has ended
  inside a pad (`portalAt`), once per walk, behind a short fade.
- **Who is where.** `world.places` gives a head count per place for the pad
  labels, and `world.elsewhere` gives the names by place for the people
  sheet, reading your blocks once instead of per person. Both rerun when
  anyone joins, leaves or travels; the second is subscribed only while the
  sheet is open.
- **Scenes** are built with the Garden's `Builder` (`placeScenes.ts`); each
  place has its own colours in `palette.ts`.
- **Sitting is a move.** `SEATS` lists each place's seats (where, which way
  they face, how high). `world.sit` takes a seat id, starts a walk from
  where the server has you straight to the seat, and sets
  `worldState.seat`; it spends a move token and writes only your own row.
  Every phone draws the sitting pose once that walk has arrived, turned the
  seat's way and lifted to its height. Any `move` or `travel` clears it, so
  standing up is just walking off. Bench seats are inside the furniture's
  no-standing outline on purpose: only `sit` can put you there. The server
  does not check whether a seat is taken (that would read the whole room on
  every sit); the app sends you to the nearest free seat on the same piece
  of furniture, and two people tapping the same seat in the same instant
  would overlap. A seat's furniture is drawn in two parts where it has a
  back (the pews), so the sitter sorts between seat and backrest.

## Write budget

Estimated by `convex/world.test.ts` ("write budget per player"), ten minutes
of simulated play against the real mutations, counting writes per code path
(mutation counts were also measured live from two web clients):

| Player | Mutations a minute | Document writes a minute |
| --- | ---: | ---: |
| Typical: 8 taps, 1 emote, 2 lines | 11 | about 15 |
| Dragging for 3 s | 1 move, on release | the same |
| At every rate limit (scripted, not the app) | about 151 accepted | at most 152, 158 in a full chat room |
| Idle | about 1.3 heartbeats | at most 1.3 |

A line in a room already holding 50 lines also deletes the oldest, one more
write (at most 6 a minute at the line limit, so at most 53 then). A
high-five ask or accept is one write, like an emote, on the same rate limit;
saving a look is one write. Join and leave are a handful of writes
once per visit (leave also keeps the rate limits in `worldThrottle`), and the
sweeper adds two calls a minute while anyone is in.
