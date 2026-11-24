# verify: scoped

- because games: src/lib/games/glider.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 75s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 15s |  |
| related unit tests | ✔ pass | 3s | 40 passed (40) |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 16s | before functions on :3270 |
| before: web | ✔ pass | 169s | 38 screens, 0 broken. |
| before: iOS reset | ✔ pass | 3s |  |
| before: iOS | ✔ pass | 254s | 21 screenshots, every one settled |
| after: local backend | ✔ pass | 50s | after functions on :3270 |
| after: web | ✔ pass | 213s | 38 screens, 0 broken. |
| after: iOS reset | ✔ pass | 4s |  |
| after: iOS | ✔ pass | 223s | 21 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-games_flappy` | <img src="before/web/admin-games_flappy.png" width="260"> | <img src="after/web/admin-games_flappy.png" width="260"> |
| web `admin-games_glider` | <img src="before/web/admin-games_glider.png" width="260"> | <img src="after/web/admin-games_glider.png" width="260"> |
| web `admin-games_glider_preview_dive` | <img src="before/web/admin-games_glider_preview_dive.png" width="260"> | <img src="after/web/admin-games_glider_preview_dive.png" width="260"> |
| web `admin-games_glider_preview_high` | <img src="before/web/admin-games_glider_preview_high.png" width="260"> | <img src="after/web/admin-games_glider_preview_high.png" width="260"> |
| web `admin-games_glider_preview_launch` | <img src="before/web/admin-games_glider_preview_launch.png" width="260"> | <img src="after/web/admin-games_glider_preview_launch.png" width="260"> |
| web `admin-games_glider_preview_night` | <img src="before/web/admin-games_glider_preview_night.png" width="260"> | <img src="after/web/admin-games_glider_preview_night.png" width="260"> |
| web `admin-games_glider_preview_world` | <img src="before/web/admin-games_glider_preview_world.png" width="260"> | <img src="after/web/admin-games_glider_preview_world.png" width="260"> |
| web `admin-games_leaderboard` | <img src="before/web/admin-games_leaderboard.png" width="260"> | <img src="after/web/admin-games_leaderboard.png" width="260"> |
| web `admin-games_leaderboard_game_glider` | <img src="before/web/admin-games_leaderboard_game_glider.png" width="260"> | <img src="after/web/admin-games_leaderboard_game_glider.png" width="260"> |
| web `admin-games_leaderboard_game_runner` | <img src="before/web/admin-games_leaderboard_game_runner.png" width="260"> | <img src="after/web/admin-games_leaderboard_game_runner.png" width="260"> |
| web `admin-games_runner` | <img src="before/web/admin-games_runner.png" width="260"> | <img src="after/web/admin-games_runner.png" width="260"> |
| web `admin-games_runner_preview_double` | <img src="before/web/admin-games_runner_preview_double.png" width="260"> | <img src="after/web/admin-games_runner_preview_double.png" width="260"> |
| web `admin-games_runner_preview_hang` | <img src="before/web/admin-games_runner_preview_hang.png" width="260"> | <img src="after/web/admin-games_runner_preview_hang.png" width="260"> |
| web `admin-games_runner_preview_tall` | <img src="before/web/admin-games_runner_preview_tall.png" width="260"> | <img src="after/web/admin-games_runner_preview_tall.png" width="260"> |
| web `admin-games_runner_preview_wide` | <img src="before/web/admin-games_runner_preview_wide.png" width="260"> | <img src="after/web/admin-games_runner_preview_wide.png" width="260"> |
| web `admin-games_shooter` | <img src="before/web/admin-games_shooter.png" width="260"> | <img src="after/web/admin-games_shooter.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-games` | <img src="before/web/out-games.png" width="260"> | <img src="after/web/out-games.png" width="260"> |
| web `out-games_flappy` | <img src="before/web/out-games_flappy.png" width="260"> | <img src="after/web/out-games_flappy.png" width="260"> |
| web `out-games_glider` | <img src="before/web/out-games_glider.png" width="260"> | <img src="after/web/out-games_glider.png" width="260"> |
| web `out-games_glider_preview_dive` | <img src="before/web/out-games_glider_preview_dive.png" width="260"> | <img src="after/web/out-games_glider_preview_dive.png" width="260"> |
| web `out-games_glider_preview_high` | <img src="before/web/out-games_glider_preview_high.png" width="260"> | <img src="after/web/out-games_glider_preview_high.png" width="260"> |
| web `out-games_glider_preview_launch` | <img src="before/web/out-games_glider_preview_launch.png" width="260"> | <img src="after/web/out-games_glider_preview_launch.png" width="260"> |
| web `out-games_glider_preview_night` | <img src="before/web/out-games_glider_preview_night.png" width="260"> | <img src="after/web/out-games_glider_preview_night.png" width="260"> |
| web `out-games_glider_preview_world` | <img src="before/web/out-games_glider_preview_world.png" width="260"> | <img src="after/web/out-games_glider_preview_world.png" width="260"> |
| web `out-games_leaderboard` | <img src="before/web/out-games_leaderboard.png" width="260"> | <img src="after/web/out-games_leaderboard.png" width="260"> |
| web `out-games_leaderboard_game_glider` | <img src="before/web/out-games_leaderboard_game_glider.png" width="260"> | <img src="after/web/out-games_leaderboard_game_glider.png" width="260"> |
| web `out-games_leaderboard_game_runner` | <img src="before/web/out-games_leaderboard_game_runner.png" width="260"> | <img src="after/web/out-games_leaderboard_game_runner.png" width="260"> |
| web `out-games_runner` | <img src="before/web/out-games_runner.png" width="260"> | <img src="after/web/out-games_runner.png" width="260"> |
| web `out-games_runner_preview_double` | <img src="before/web/out-games_runner_preview_double.png" width="260"> | <img src="after/web/out-games_runner_preview_double.png" width="260"> |
| web `out-games_runner_preview_hang` | <img src="before/web/out-games_runner_preview_hang.png" width="260"> | <img src="after/web/out-games_runner_preview_hang.png" width="260"> |
| web `out-games_runner_preview_tall` | <img src="before/web/out-games_runner_preview_tall.png" width="260"> | <img src="after/web/out-games_runner_preview_tall.png" width="260"> |
| web `out-games_runner_preview_wide` | <img src="before/web/out-games_runner_preview_wide.png" width="260"> | <img src="after/web/out-games_runner_preview_wide.png" width="260"> |
| web `out-games_shooter` | <img src="before/web/out-games_shooter.png" width="260"> | <img src="after/web/out-games_shooter.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-games` | <img src="before/ios/admin-games.png" width="260"> | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-games_flappy` | <img src="before/ios/admin-games_flappy.png" width="260"> | <img src="after/ios/admin-games_flappy.png" width="260"> |
| ios `admin-games_glider` | <img src="before/ios/admin-games_glider.png" width="260"> | <img src="after/ios/admin-games_glider.png" width="260"> |
| ios `admin-games_glider_preview_dive` | <img src="before/ios/admin-games_glider_preview_dive.png" width="260"> | <img src="after/ios/admin-games_glider_preview_dive.png" width="260"> |
| ios `admin-games_glider_preview_high` | <img src="before/ios/admin-games_glider_preview_high.png" width="260"> | <img src="after/ios/admin-games_glider_preview_high.png" width="260"> |
| ios `admin-games_glider_preview_launch` | <img src="before/ios/admin-games_glider_preview_launch.png" width="260"> | <img src="after/ios/admin-games_glider_preview_launch.png" width="260"> |
| ios `admin-games_glider_preview_night` | <img src="before/ios/admin-games_glider_preview_night.png" width="260"> | <img src="after/ios/admin-games_glider_preview_night.png" width="260"> |
| ios `admin-games_glider_preview_world` | <img src="before/ios/admin-games_glider_preview_world.png" width="260"> | <img src="after/ios/admin-games_glider_preview_world.png" width="260"> |
| ios `admin-games_leaderboard` | <img src="before/ios/admin-games_leaderboard.png" width="260"> | <img src="after/ios/admin-games_leaderboard.png" width="260"> |
| ios `admin-games_leaderboard_game_glider` | <img src="before/ios/admin-games_leaderboard_game_glider.png" width="260"> | <img src="after/ios/admin-games_leaderboard_game_glider.png" width="260"> |
| ios `admin-games_leaderboard_game_runner` | <img src="before/ios/admin-games_leaderboard_game_runner.png" width="260"> | <img src="after/ios/admin-games_leaderboard_game_runner.png" width="260"> |
| ios `admin-games_runner` | <img src="before/ios/admin-games_runner.png" width="260"> | <img src="after/ios/admin-games_runner.png" width="260"> |
| ios `admin-games_runner_preview_double` | <img src="before/ios/admin-games_runner_preview_double.png" width="260"> | <img src="after/ios/admin-games_runner_preview_double.png" width="260"> |
| ios `admin-games_runner_preview_hang` | <img src="before/ios/admin-games_runner_preview_hang.png" width="260"> | <img src="after/ios/admin-games_runner_preview_hang.png" width="260"> |
| ios `admin-games_runner_preview_tall` | <img src="before/ios/admin-games_runner_preview_tall.png" width="260"> | <img src="after/ios/admin-games_runner_preview_tall.png" width="260"> |
| ios `admin-games_runner_preview_wide` | <img src="before/ios/admin-games_runner_preview_wide.png" width="260"> | <img src="after/ios/admin-games_runner_preview_wide.png" width="260"> |
| ios `admin-games_shooter` | <img src="before/ios/admin-games_shooter.png" width="260"> | <img src="after/ios/admin-games_shooter.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
