# Hop implementation guide

Status: WIP implementation handoff. The design below records Daniel's choices
from the three design rounds; this PR does not implement the game. Start the
implementation on a new feature branch from the latest `origin/main` and
recheck the integration points below before editing.

## Agreed scope

Hop is an offline, portrait, endless vertical platform jumper inspired by
Doodle Jump, with original SHED artwork. The character bounces automatically;
the player only steers. Use `gameId: "hop"` and the title **Hop** throughout
Games, the World arcade, presence, score storage and the leaderboard.

- Web: Left/Right arrow keys, A/D aliases, Space to restart after game over.
- Mobile: hold the left/right half of the screen; sliding across the midpoint
  switches direction without lifting.
- Classic horizontal wraparound and momentum: quick acceleration, crisp
  reversal, gentle glide after release, never an icy or sluggish feel.
- CharacterPicker: You, Sij and Original, with the same saved-choice behavior
  as the other character games.
- Four platform types and three boosts, with the animations specified below.
- Highest altitude determines score. No points for repeated bounces, pickups
  or time spent flying at the same altitude.
- Existing GameFrame, offline score queue, leaderboard and coin payout rules.
- No monsters, shooting, tilt controls, new native dependencies or gameplay
  haptics. Keep GameFrame's existing UI haptics.

## Sky Journal art direction

The board is a warm SHED sketchbook page, not a copy of Doodle Jump's art.
Start with SHED cream (`#F5F3E3`), faint crisp graph-paper lines, a vertical
terracotta margin rule and hand-inked altitude marks every 500 points. Platforms
look like marker strokes with ink outlines, not glossy floating blocks.

Use a smooth altitude-driven color wash rather than page flips or hard cuts:

| Climb | Look |
| --- | --- |
| Opening | Warm morning cream, readable ink, faint graph paper. |
| Clouds | Sunlit blue wash with pencil-sketched clouds. |
| Dusk | Golden terracotta wash, warm illustrated accents. |
| Around 3,000 points and above | Deep ink-navy Starry Chalk Night: chalk-white grid, doodled stars and constellations. Stay here; do not cycle back to morning. |

Exact cloud/dusk thresholds and transition widths are tuning values, not
decisions to reopen. Blend palette stops from altitude without adding a
gradient package. Keep platforms, HUD and characters readable throughout;
set GameFrame's ink/status-bar colors for the current palette. Decorations
must not suggest hazards or hide a landing surface.

Scroll grid, margin marks and platforms in world coordinates. Use bounded,
deterministic decoration so long runs do not accumulate thousands of views.
Respect the portrait board's clipping and existing letterbox behavior on wide
and short browsers; scenery outside the board must not look playable.

When the player starts with a personal best above zero, draw a dashed pencil
line labeled **BEST** at that altitude. Freeze the target for the run and give
a subtle highlight/badge once when crossed. Do not move the line up with the
current score or celebrate repeatedly.

## Characters and Sijin's look

**Original** is a Doodle Hopper: a sage-green, hand-inked rounded creature with
directional eyes, expressive springy legs and squash/stretch on bounces.

**You / Sij** use full World characters, not floating heads. Face left/right
with steering, squash/stretch on landing and raise arms during boosts. Keep a
stable, shared collision box for all three choices: avatar appearance must
not make one character easier or harder to play.

Reuse the lazy avatar loading in `src/components/games/GameCharacter.tsx` and
the art in `src/world/GameAvatars.tsx`. That module currently exports
RunnerCharacter, CharacterHead and CheeringCharacter; it does not provide a
dedicated Hop pose. Add only the pose/art support needed for directional
jumping, preserve the lazy boundary and do not import the whole World into
the app's startup path. Preserve the existing missing/loading-look fallback.

Update `NPC.look` in `shared/world.ts` to Sijin Yang's latest production World
look. Daniel explicitly chose the **global** update: the Cafe NPC and Sij in
Mystic Man, Flap, Swoop and Hop must all use the same look.

**Snapshot prerequisite:** the earlier discussion says a production record
was retrieved, but contains no actual Look values. This guide does not claim
to have verified them. During implementation, obtain a read-only snapshot of
the intended production `worldLooks` record, validate it against the current
Look schema and record the retrieval date in the implementation PR. Commit
only the appearance fields needed by `NPC.look`, not account metadata, tokens
or a raw user export. Never write to production to make this change; if the
snapshot cannot be obtained, report that blocker instead of guessing a look.

## Platforms, boosts and animation

| Type | Gameplay | Art and animation |
| --- | --- | --- |
| Normal | Unlimited normal bounces. | Sage green, inked edge, brief landing squash. |
| Moving | Normal bounce; travels left/right. | Slate blue, pencil movement track. |
| Breakable | Snaps on a descending landing, **no bounce**. Never the only viable route. | Cracked warm brown; two inked halves rotate and tumble down with debris. |
| One-bounce | One normal bounce, then gone. | Pale/dashed; impact squash, then fading chalk fragments. |
| Spring | Triggers only on a descending landing; about 2.2 times normal jump height. | Coils compress, visibly uncoil/stretch on launch, then settle. |
| Propeller hat | About 2.5 seconds of steady lift with full steering. | Attaches to the head, spins; detaches and tumbles away at expiry. |
| Jetpack | Rarer, introduced higher up; about 3.5 seconds of faster lift with full steering. | Attaches to the back, dual flickering flames/trail; detaches and tumbles away at expiry. |

Place boosts on normal platforms. During propeller/jetpack flight ignore other
boosts and springs; breakables must not snap on ascent. Do not stack or extend
flight by collecting another item. On expiry transition smoothly into normal
gravity with reachable platforms below, not into an unavoidable fall.

Treat 2.2x as a **height** multiplier, not a velocity multiplier: with unchanged
gravity the spring launch velocity is about `sqrt(2.2)` times normal launch
velocity. Keep these relationships explicit in tuning and tests.

Model animation ages/events in simulation state so pause freezes them along
with physics. Removed platforms stay non-collidable while their fragments are
drawn. Bound and expire debris, pickup effects and detached equipment. Pickup
and landing effects must fire once, including when a long frame is subdivided.

## Simulation and fair generation

Follow the pure-state style of `src/lib/games/glider.ts`: a seeded initial
state and a step function with no React, network, wall-clock or haptic calls.
Suggested files are `src/lib/games/hop.ts`, `hopTuning.ts` if needed, and
`hop.test.ts`. Render and input belong in `src/components/games/HopGame.tsx`.

Use upward-positive world altitude and convert to screen coordinates when
drawing. Keep player position/velocity, camera altitude, highest altitude,
platforms, boosts, RNG state, elapsed active time and transient effects in the
simulation. Track a short dying phase separately from `over`.

- Run through `useGameLoop` and its `advance` helper: physics substeps are at
  most 1/60 second; background frames are clamped. Do not add a second timer.
- On descending feet crossing a platform top, check horizontal overlap at the
  crossing time. Ignore undersides while rising. Use swept collision checks
  for moving platforms and seam wrapping so fast motion cannot tunnel.
- Resolve the first contact in time deterministically; a platform cannot
  bounce or break twice in one substep.
- Camera follows ascent without scrolling backwards in ordinary play. Score
  is the nonnegative integer highest height above the starting reference,
  using one documented units-per-point conversion. Camera/effect movement
  cannot increase it.
- Wrap player motion continuously at the horizontal seam. Use the same seam
  geometry for collision and drawing; do not teleport through a platform.
- Generate ahead of the visible camera and retire objects safely below it.
  Storage, rendered views and effect counts must stay bounded in long runs.

Difficulty is a classic steady climb, not the fast arcade alternative:

| Score milestone (approximate) | Change |
| --- | --- |
| Opening | Mostly normal platforms, generous gaps, early springs. |
| 300 | Introduce moving platforms. |
| 500 | Introduce breakable decoys beside viable landings. |
| 900 | Introduce one-bounce platforms. |
| 4,000–5,000 | Reach the intended peak difficulty; stop increasing gaps beyond what the physics allows. |

Create a guaranteed route before optional decoys/items. For an ordinary jump
derive maximum rise from `vJump² / (2g)` and reserve a landing margin below the
apex. Also bound horizontal distance by flight time, acceleration, reversal,
platform width and wraparound. Vertical reach alone is not a proof of fairness.
For moving platforms account for their position at landing, not just spawn.
Never require a breakable platform or an optional boost to continue. Check
post-flight landing corridors after both powered boosts. A one-bounce platform
may be part of the route only if its next landing is reachable on the first
bounce. Test many seeded routes at every difficulty band and board aspect.

## Controls and lifecycle

Both keyboard and touch drive the same signed steering input; neither changes
the physics constants. Use stage coordinates transformed for GameFrame's
scale/letterboxing, not raw browser or device coordinates, to locate the
touch midpoint. Controls should work anywhere on the playable stage without
capturing start-card, picker, leaderboard or exit-button interactions.

Use `useWebKeys`; prevent arrow-key scrolling only when Hop owns that input.
Preserve CharacterPicker's keyboard navigation before starting. Clear held
keys/touches on blur, responder cancellation, screen deactivation, leave
confirmation and restart. Define simultaneous opposing holds deterministically
(neutral is the proposed default); releasing one must leave the other held.
Do not let a held/repeated Space bypass `canRestartByKey` or leak into a new run.

Pause simulation when the route is inactive or the leave dialog is open;
freeze score, active duration, boost timers and effects. A leaderboard opened
over Hop must not advance the game behind it. Reuse `useGameSession` and the
existing leave guard rather than inventing a separate saving/back flow.

After the character falls below the board, commit to a roughly 0.45-second
fall-off tumble with a small downward camera pan, then set `over: true` and
show GameFrame's result card. Do not land, collect items or increase score in
that dying phase. Publish the result once via the existing session path and
clear all run-specific effects/input on restart.

## Integration checklist

These paths were checked against main at the time this guide was written:

| Existing file/area | Required implementation change |
| --- | --- |
| `shared/games.ts` | Add Hop to GAME_IDS, GAME_INFO, all versioned SCORE_LIMITS, NO_BESTS and parseBests. Preserve old saved bests/queues. |
| `shared/gameCharacters.ts` | Add Hop to CHARACTER_GAMES, DEFAULT_CHARACTERS and parseCharacters. Old saved choices must acquire a safe Hop default. |
| `convex/gameScoreData.ts` | Extend gameIdValidator with `v.literal("hop")`; inspect every schema/API use before deploying. |
| `convex/gameScores.ts` and its tests | Exercise Hop validation, personal bests, leaderboard queries, retry/idempotency and existing coin payouts. Reuse rules; no new economy or notification policy. |
| `src/components/games/gameScreens.ts` | Register HopGame in GAME_SCREENS; dynamic `/games/[game]` then resolves `/games/hop`. |
| `src/components/games/GamesMenu.tsx` | Add typed icon and short instructions; check both Games and World arcade entry points. |
| `src/lib/games/playArea.ts` | Add a portrait GAME_VIEWS rule; use existing Flap sizing as a starting point, test wide/short windows. |
| `src/theme.ts` | Add Hop's fixed game palette and go-back button colors without hard-coded component palette drift. |
| `src/components/games/GameCharacter.tsx`, `src/world/GameAvatars.tsx`, `shared/world.ts` | Wire Hop's picker/art and update the shared Sijin look. |
| `src/app/games/leaderboard.tsx`, offline Games and World arcade | Audit typed game records, tabs, route params, local storage and presence for assumptions about only four games. |
| `scripts/verify/feature-map.json` and sweep tooling | Add `/games/hop`, its leaderboard tab and deterministic Hop preview routes/checks. Map new files and include Cafe/existing character games for the Sijin change. |

Use the current shared GAME_VERSION; do not bump all existing games merely
because Hop is new. The current SCORE_LIMITS type requires an entry for both
versions 1 and 2: handle that explicitly without changing existing limits.
Derive Hop's per-second limit from the fastest possible ascent, including
spring and jetpack transitions, and its absolute cap from the allowed run
duration. Verify legal runs against `scoreProblem`, and freeze scoring at the
chosen cap or end the run gracefully; never silently discard a legal best.

Read `convex/_generated/ai/guidelines.md` before changing backend code, and the
versioned Expo docs required by AGENTS.md before writing app code. Deploy
backend support for the additive game id before releasing clients that submit
it. Do not hand-edit generated Convex files or introduce a destructive score
migration.

## Tests and acceptance evidence

Add pure tests for bounce/underside/contact ordering, seam collision, moving
platform interception, breakable no-bounce, one-bounce removal, spring height,
boost duration/exclusivity/expiry, steering/reversal/release, capped difficulty,
seed determinism, reachable paths, bounded state, monotonic height scoring,
pause and the delayed single game-over transition. Compare equivalent elapsed
time at different frame rates, within a documented numerical tolerance.

Extend shared tests for old local storage missing Hop, character defaults,
queue ownership/retries, plausible score acceptance and impossible score
rejection. Add Convex tests for Hop's leaderboard and payout path, preserving
the existing eligibility and notification behavior.

Before the implementation PR is marked ready:

1. Run the repo gates: `npx eslint . --max-warnings 0`, `npx knip`,
   `npm run typecheck`, `npm run test:coverage`, and
   `EXPO_OFFLINE=1 npx expo install --check`.
2. Plan/run `node scripts/verify.mjs --dry-run` and
   `node scripts/verify.mjs --publish` per `docs/verification.md`. Use its local
   throwaway backend; never disturb the running worktree's Metro on 8081.
3. Capture deterministic opening/cloud/dusk/night scenes, BEST crossing,
   each platform break and each boost. Any debug preview/practice routes must
   be test-build-only and must not publish scores or award coins.
4. On web, drive arrow/A-D holds, reversals, wrap, blur, Space restart, picker,
   leave/stay and leaderboard return. Test a tall and a short/wide browser.
5. On iOS, drive both touch halves and midpoint sliding, cancellation,
   leave/stay, restart and offline play. Verify all three characters, readable
   controls/cards and safe areas. Android manual evidence is separate if
   requested; do not claim it from an iOS pass.
6. Check the updated Cafe NPC and Sij in the existing games. Compare the
   source snapshot's appearance with the rendered result, not just its fields.
7. Complete the implementation PR's version/changelog/docs and explain-page
   steps from `.claude/skills/create-pr/SKILL.md`. Report what was and was not
   verified; request CodeRabbit only under the repo's big-PR rule.

This guide-only PR changes no runtime behavior, backend, native fingerprint
or release version. The gameplay and verification work above remains for the
implementation PR.
