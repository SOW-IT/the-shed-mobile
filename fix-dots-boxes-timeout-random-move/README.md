# verify: scoped

- because world: convex/cafeGames.ts
- because games, world: shared/cafeGames.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 90s |  |
| unused code (knip) | ✔ pass | 6s |  |
| typecheck | ✔ pass | 22s |  |
| related unit tests | ✔ pass | 15s | 1934 passed (1934) |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 19s | before functions on :3270 |
| before: web | ✔ pass | 361s | 58 screens, 0 broken, still moving: out-games_leaderboard, out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner. Checks passed: chapel-pews, arcade-podium, rps-ask, backyard-chat, game-over-back. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 574s | 31 screenshots; still moving after 10 frames: admin-games_leaderboard, admin-games_leaderboard_game_runner, admin-games_leaderboard_game_glider; checks passed: chapel-pews, arcade-podium, backyard-chat, game-over-back |
| after: local backend | ✔ pass | 19s | after functions on :3270 |
| after: web | ✔ pass | 356s | 58 screens, 0 broken, still moving: out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner. Checks passed: chapel-pews, arcade-podium, rps-ask, backyard-chat, game-over-back. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 594s | 31 screenshots; still moving after 10 frames: admin-games_leaderboard, admin-games_leaderboard_game_runner, admin-games_leaderboard_game_glider; checks passed: chapel-pews, arcade-podium, backyard-chat, game-over-back |

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
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `admin-world` | <img src="before/web/admin-world.png" width="260"> | <img src="after/web/admin-world.png" width="260"> |
| web `admin-world_calendar` | <img src="before/web/admin-world_calendar.png" width="260"> | <img src="after/web/admin-world_calendar.png" width="260"> |
| web `admin-world_devotionals` | <img src="before/web/admin-world_devotionals.png" width="260"> | <img src="after/web/admin-world_devotionals.png" width="260"> |
| web `admin-world_praise` | <img src="before/web/admin-world_praise.png" width="260"> | <img src="after/web/admin-world_praise.png" width="260"> |
| web `admin-world_sheet_arcade` | <img src="before/web/admin-world_sheet_arcade.png" width="260"> | <img src="after/web/admin-world_sheet_arcade.png" width="260"> |
| web `admin-world_sheet_character` | <img src="before/web/admin-world_sheet_character.png" width="260"> | <img src="after/web/admin-world_sheet_character.png" width="260"> |
| web `admin-world_sheet_poke` | <img src="before/web/admin-world_sheet_poke.png" width="260"> | <img src="after/web/admin-world_sheet_poke.png" width="260"> |
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
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| web `out-world` | <img src="before/web/out-world.png" width="260"> | <img src="after/web/out-world.png" width="260"> |
| web `out-world_calendar` | <img src="before/web/out-world_calendar.png" width="260"> | <img src="after/web/out-world_calendar.png" width="260"> |
| web `out-world_devotionals` | <img src="before/web/out-world_devotionals.png" width="260"> | <img src="after/web/out-world_devotionals.png" width="260"> |
| web `out-world_praise` | <img src="before/web/out-world_praise.png" width="260"> | <img src="after/web/out-world_praise.png" width="260"> |
| web `out-world_sheet_arcade` | <img src="before/web/out-world_sheet_arcade.png" width="260"> | <img src="after/web/out-world_sheet_arcade.png" width="260"> |
| web `out-world_sheet_character` | <img src="before/web/out-world_sheet_character.png" width="260"> | <img src="after/web/out-world_sheet_character.png" width="260"> |
| web `out-world_sheet_poke` | <img src="before/web/out-world_sheet_poke.png" width="260"> | <img src="after/web/out-world_sheet_poke.png" width="260"> |
| ios `admin-games` | <img src="before/ios/admin-games.png" width="260"> | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-games_cafe` | <img src="before/ios/admin-games_cafe.png" width="260"> | <img src="after/ios/admin-games_cafe.png" width="260"> |
| ios `admin-games_flappy` | <img src="before/ios/admin-games_flappy.png" width="260"> | <img src="after/ios/admin-games_flappy.png" width="260"> |
| ios `admin-games_glider` | <img src="before/ios/admin-games_glider.png" width="260"> | <img src="after/ios/admin-games_glider.png" width="260"> |
| ios `admin-games_glider_preview_dive` | <img src="before/ios/admin-games_glider_preview_dive.png" width="260"> | <img src="after/ios/admin-games_glider_preview_dive.png" width="260"> |
| ios `admin-games_glider_preview_high` | <img src="before/ios/admin-games_glider_preview_high.png" width="260"> | <img src="after/ios/admin-games_glider_preview_high.png" width="260"> |
| ios `admin-games_glider_preview_launch` | <img src="before/ios/admin-games_glider_preview_launch.png" width="260"> | <img src="after/ios/admin-games_glider_preview_launch.png" width="260"> |
| ios `admin-games_glider_preview_night` | <img src="before/ios/admin-games_glider_preview_night.png" width="260"> | <img src="after/ios/admin-games_glider_preview_night.png" width="260"> |
| ios `admin-games_glider_preview_world` | <img src="before/ios/admin-games_glider_preview_world.png" width="260"> | <img src="after/ios/admin-games_glider_preview_world.png" width="260"> |
| ios `admin-games_glider_preview_world3` | <img src="before/ios/admin-games_glider_preview_world3.png" width="260"> | <img src="after/ios/admin-games_glider_preview_world3.png" width="260"> |
| ios `admin-games_glider_preview_world6` | <img src="before/ios/admin-games_glider_preview_world6.png" width="260"> | <img src="after/ios/admin-games_glider_preview_world6.png" width="260"> |
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
| ios `admin-world` | <img src="before/ios/admin-world.png" width="260"> | <img src="after/ios/admin-world.png" width="260"> |
| ios `admin-world_calendar` | <img src="before/ios/admin-world_calendar.png" width="260"> | <img src="after/ios/admin-world_calendar.png" width="260"> |
| ios `admin-world_devotionals` | <img src="before/ios/admin-world_devotionals.png" width="260"> | <img src="after/ios/admin-world_devotionals.png" width="260"> |
| ios `admin-world_praise` | <img src="before/ios/admin-world_praise.png" width="260"> | <img src="after/ios/admin-world_praise.png" width="260"> |
| ios `admin-world_sheet_arcade` | <img src="before/ios/admin-world_sheet_arcade.png" width="260"> | <img src="after/ios/admin-world_sheet_arcade.png" width="260"> |
| ios `admin-world_sheet_character` | <img src="before/ios/admin-world_sheet_character.png" width="260"> | <img src="after/ios/admin-world_sheet_character.png" width="260"> |
| ios `admin-world_sheet_poke` | <img src="before/ios/admin-world_sheet_poke.png" width="260"> | <img src="after/ios/admin-world_sheet_poke.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
