# verify: scoped

- because games: src/app/games/leaderboard.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 92s |  |
| unused code (knip) | ✔ pass | 6s |  |
| typecheck | ✔ pass | 20s |  |
| related unit tests | ✔ pass | 2s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 19s | before functions on :3270 |
| before: web | ⚠ warning | 307s | 44 screens, 0 broken, still moving: out-games_leaderboard, out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner.; check leaderboard-link-tab failed: ✘ ?game=runner while the Leaderboard is open: "Play Mystic Man" never showed, the tab stayed where it was ✘ ?game=glider while the Leaderboard is open: "Play Swoop" never showed, the tab stayed where it was |
| after: local backend | ✔ pass | 18s | after functions on :3270 |
| after: web | ✔ pass | 289s | 44 screens, 0 broken, still moving: out-games_leaderboard, out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner. Checks passed: arcade-podium, game-over-back, cafe-back-confirm, swoop-letterbox, leaderboard-link-tab. |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-games_cafe` | <img src="before/web/admin-games_cafe.png" width="260"> | <img src="after/web/admin-games_cafe.png" width="260"> |
| web `admin-games_flappy` | <img src="before/web/admin-games_flappy.png" width="260"> | <img src="after/web/admin-games_flappy.png" width="260"> |
| web `admin-games_glider` | <img src="before/web/admin-games_glider.png" width="260"> | <img src="after/web/admin-games_glider.png" width="260"> |
| web `admin-games_glider_preview_dive` | <img src="before/web/admin-games_glider_preview_dive.png" width="260"> | <img src="after/web/admin-games_glider_preview_dive.png" width="260"> |
| web `admin-games_glider_preview_high` | <img src="before/web/admin-games_glider_preview_high.png" width="260"> | <img src="after/web/admin-games_glider_preview_high.png" width="260"> |
| web `admin-games_glider_preview_launch` | <img src="before/web/admin-games_glider_preview_launch.png" width="260"> | <img src="after/web/admin-games_glider_preview_launch.png" width="260"> |
| web `admin-games_glider_preview_night` | <img src="before/web/admin-games_glider_preview_night.png" width="260"> | <img src="after/web/admin-games_glider_preview_night.png" width="260"> |
| web `admin-games_glider_preview_world` | <img src="before/web/admin-games_glider_preview_world.png" width="260"> | <img src="after/web/admin-games_glider_preview_world.png" width="260"> |
| web `admin-games_glider_preview_world3` | <img src="before/web/admin-games_glider_preview_world3.png" width="260"> | <img src="after/web/admin-games_glider_preview_world3.png" width="260"> |
| web `admin-games_glider_preview_world6` | <img src="before/web/admin-games_glider_preview_world6.png" width="260"> | <img src="after/web/admin-games_glider_preview_world6.png" width="260"> |
| web `admin-games_leaderboard` | <img src="before/web/admin-games_leaderboard.png" width="260"> | <img src="after/web/admin-games_leaderboard.png" width="260"> |
| web `admin-games_leaderboard_game_glider` | <img src="before/web/admin-games_leaderboard_game_glider.png" width="260"> | <img src="after/web/admin-games_leaderboard_game_glider.png" width="260"> |
| web `admin-games_leaderboard_game_runner` | <img src="before/web/admin-games_leaderboard_game_runner.png" width="260"> | <img src="after/web/admin-games_leaderboard_game_runner.png" width="260"> |
| web `admin-games_runner` | <img src="before/web/admin-games_runner.png" width="260"> | <img src="after/web/admin-games_runner.png" width="260"> |
| web `admin-games_runner_preview_double` | <img src="before/web/admin-games_runner_preview_double.png" width="260"> | <img src="after/web/admin-games_runner_preview_double.png" width="260"> |
| web `admin-games_runner_preview_hang` | <img src="before/web/admin-games_runner_preview_hang.png" width="260"> | <img src="after/web/admin-games_runner_preview_hang.png" width="260"> |
| web `admin-games_runner_preview_tall` | <img src="before/web/admin-games_runner_preview_tall.png" width="260"> | <img src="after/web/admin-games_runner_preview_tall.png" width="260"> |
| web `admin-games_runner_preview_wide` | <img src="before/web/admin-games_runner_preview_wide.png" width="260"> | <img src="after/web/admin-games_runner_preview_wide.png" width="260"> |
| web `admin-games_shooter` | <img src="before/web/admin-games_shooter.png" width="260"> | <img src="after/web/admin-games_shooter.png" width="260"> |
| web `admin-org` | <img src="before/web/admin-org.png" width="260"> | <img src="after/web/admin-org.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-games` | <img src="before/web/out-games.png" width="260"> | <img src="after/web/out-games.png" width="260"> |
| web `out-games_cafe` | <img src="before/web/out-games_cafe.png" width="260"> | <img src="after/web/out-games_cafe.png" width="260"> |
| web `out-games_flappy` | <img src="before/web/out-games_flappy.png" width="260"> | <img src="after/web/out-games_flappy.png" width="260"> |
| web `out-games_glider` | <img src="before/web/out-games_glider.png" width="260"> | <img src="after/web/out-games_glider.png" width="260"> |
| web `out-games_glider_preview_dive` | <img src="before/web/out-games_glider_preview_dive.png" width="260"> | <img src="after/web/out-games_glider_preview_dive.png" width="260"> |
| web `out-games_glider_preview_high` | <img src="before/web/out-games_glider_preview_high.png" width="260"> | <img src="after/web/out-games_glider_preview_high.png" width="260"> |
| web `out-games_glider_preview_launch` | <img src="before/web/out-games_glider_preview_launch.png" width="260"> | <img src="after/web/out-games_glider_preview_launch.png" width="260"> |
| web `out-games_glider_preview_night` | <img src="before/web/out-games_glider_preview_night.png" width="260"> | <img src="after/web/out-games_glider_preview_night.png" width="260"> |
| web `out-games_glider_preview_world` | <img src="before/web/out-games_glider_preview_world.png" width="260"> | <img src="after/web/out-games_glider_preview_world.png" width="260"> |
| web `out-games_glider_preview_world3` | <img src="before/web/out-games_glider_preview_world3.png" width="260"> | <img src="after/web/out-games_glider_preview_world3.png" width="260"> |
| web `out-games_glider_preview_world6` | <img src="before/web/out-games_glider_preview_world6.png" width="260"> | <img src="after/web/out-games_glider_preview_world6.png" width="260"> |
| web `out-games_leaderboard` | <img src="before/web/out-games_leaderboard.png" width="260"> | <img src="after/web/out-games_leaderboard.png" width="260"> |
| web `out-games_leaderboard_game_glider` | <img src="before/web/out-games_leaderboard_game_glider.png" width="260"> | <img src="after/web/out-games_leaderboard_game_glider.png" width="260"> |
| web `out-games_leaderboard_game_runner` | <img src="before/web/out-games_leaderboard_game_runner.png" width="260"> | <img src="after/web/out-games_leaderboard_game_runner.png" width="260"> |
| web `out-games_runner` | <img src="before/web/out-games_runner.png" width="260"> | <img src="after/web/out-games_runner.png" width="260"> |
| web `out-games_runner_preview_double` | <img src="before/web/out-games_runner_preview_double.png" width="260"> | <img src="after/web/out-games_runner_preview_double.png" width="260"> |
| web `out-games_runner_preview_hang` | <img src="before/web/out-games_runner_preview_hang.png" width="260"> | <img src="after/web/out-games_runner_preview_hang.png" width="260"> |
| web `out-games_runner_preview_tall` | <img src="before/web/out-games_runner_preview_tall.png" width="260"> | <img src="after/web/out-games_runner_preview_tall.png" width="260"> |
| web `out-games_runner_preview_wide` | <img src="before/web/out-games_runner_preview_wide.png" width="260"> | <img src="after/web/out-games_runner_preview_wide.png" width="260"> |
| web `out-games_shooter` | <img src="before/web/out-games_shooter.png" width="260"> | <img src="after/web/out-games_shooter.png" width="260"> |
| web `out-org` | <img src="before/web/out-org.png" width="260"> | <img src="after/web/out-org.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
