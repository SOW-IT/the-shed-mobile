# verify: scoped

- because games: src/components/games/FocusedStatusBar.tsx
- because games: src/components/games/GameFrame.tsx
- because games, world: src/components/games/GamesMenu.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 85s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 19s |  |
| related unit tests | ✔ pass | 1s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 19s | before functions on :3270 |
| before: web | ✔ pass | 433s | 58 screens, 0 broken, still moving: out-games_leaderboard, out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner, admin-world, admin-world_sheet_poke, admin-world_sheet_arcade. Checks passed: arcade-podium, game-over-back, cafe-back-confirm, chapel-pews, rps-ask, backyard-chat, outfits, eye-shapes. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ⚠ warning | 1154s | check backyard-chat failed, see .verify/run/before/logs/check-backyard-chat-ios.log Assert that id: world-title is visible... COMPLETED Run flow when ".*backyard.*", id: world-title is not visible...   Run flow when id: world-menu-home is visible...   Run flow when id: world-menu-home is visible... COMPLETED |
| after: local backend | ✔ pass | 18s | after functions on :3270 |
| after: web | ✔ pass | 429s | 58 screens, 0 broken, still moving: out-games_leaderboard, out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner, admin-world, admin-world_sheet_poke, admin-world_sheet_arcade. Checks passed: arcade-podium, game-over-back, cafe-back-confirm, chapel-pews, rps-ask, backyard-chat, outfits, eye-shapes. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✘ fail | 1194s | check backyard-chat failed, see .verify/run/after/logs/check-backyard-chat-ios.log Assert that id: world-title is visible... COMPLETED Run flow when ".*backyard.*", id: world-title is not visible...   Run flow when id: world-menu-home is visible...   Run flow when id: world-menu-home is visible... COMPLETED |

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
| web `out-org` | <img src="before/web/out-org.png" width="260"> | <img src="after/web/out-org.png" width="260"> |
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
| ios `admin-org` | <img src="before/ios/admin-org.png" width="260"> | <img src="after/ios/admin-org.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | <img src="before/ios/admin-world.png" width="260"> | <img src="after/ios/admin-world.png" width="260"> |
| ios `admin-world_calendar` | <img src="before/ios/admin-world_calendar.png" width="260"> | <img src="after/ios/admin-world_calendar.png" width="260"> |
| ios `admin-world_devotionals` | <img src="before/ios/admin-world_devotionals.png" width="260"> | <img src="after/ios/admin-world_devotionals.png" width="260"> |
| ios `admin-world_praise` | <img src="before/ios/admin-world_praise.png" width="260"> | <img src="after/ios/admin-world_praise.png" width="260"> |
| ios `admin-world_sheet_arcade` | <img src="before/ios/admin-world_sheet_arcade.png" width="260"> | <img src="after/ios/admin-world_sheet_arcade.png" width="260"> |
| ios `admin-world_sheet_character` | <img src="before/ios/admin-world_sheet_character.png" width="260"> | <img src="after/ios/admin-world_sheet_character.png" width="260"> |
| ios `admin-world_sheet_poke` | <img src="before/ios/admin-world_sheet_poke.png" width="260"> | <img src="after/ios/admin-world_sheet_poke.png" width="260"> |
| ios `out-org` | <img src="before/ios/out-org.png" width="260"> | <img src="after/ios/out-org.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
