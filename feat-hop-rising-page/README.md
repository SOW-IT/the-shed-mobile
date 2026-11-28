# verify: scoped

- because --only games

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 92s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 20s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| after: local backend | ✔ pass | 20s | after functions on :3270 |
| after: web | ✔ pass | 478s | 78 screens, 0 broken, still moving: out-games_leaderboard, out-games_leaderboard_game_runner, admin-games_leaderboard, admin-games_leaderboard_game_runner. Checks passed: arcade-podium, game-over-back, cafe-back-confirm, swoop-letterbox, leaderboard-link-tab, hop. |
| after: iOS reset | ✔ pass | 3s |  |
| after: iOS | ✔ pass | 887s | 41 screenshots; still moving after 10 frames: admin-games_leaderboard, admin-games_leaderboard_game_runner, admin-games_leaderboard_game_hop; checks passed: arcade-podium, game-over-back, cafe-back-confirm, status-bar-after-game, hop |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | (none) | <img src="after/web/admin-games.png" width="260"> |
| web `admin-games_cafe` | (none) | <img src="after/web/admin-games_cafe.png" width="260"> |
| web `admin-games_flappy` | (none) | <img src="after/web/admin-games_flappy.png" width="260"> |
| web `admin-games_glider` | (none) | <img src="after/web/admin-games_glider.png" width="260"> |
| web `admin-games_glider_preview_dive` | (none) | <img src="after/web/admin-games_glider_preview_dive.png" width="260"> |
| web `admin-games_glider_preview_high` | (none) | <img src="after/web/admin-games_glider_preview_high.png" width="260"> |
| web `admin-games_glider_preview_launch` | (none) | <img src="after/web/admin-games_glider_preview_launch.png" width="260"> |
| web `admin-games_glider_preview_night` | (none) | <img src="after/web/admin-games_glider_preview_night.png" width="260"> |
| web `admin-games_glider_preview_world` | (none) | <img src="after/web/admin-games_glider_preview_world.png" width="260"> |
| web `admin-games_glider_preview_world3` | (none) | <img src="after/web/admin-games_glider_preview_world3.png" width="260"> |
| web `admin-games_glider_preview_world6` | (none) | <img src="after/web/admin-games_glider_preview_world6.png" width="260"> |
| web `admin-games_hop` | (none) | <img src="after/web/admin-games_hop.png" width="260"> |
| web `admin-games_hop_preview_best` | (none) | <img src="after/web/admin-games_hop_preview_best.png" width="260"> |
| web `admin-games_hop_preview_break` | (none) | <img src="after/web/admin-games_hop_preview_break.png" width="260"> |
| web `admin-games_hop_preview_clouds` | (none) | <img src="after/web/admin-games_hop_preview_clouds.png" width="260"> |
| web `admin-games_hop_preview_crossed` | (none) | <img src="after/web/admin-games_hop_preview_crossed.png" width="260"> |
| web `admin-games_hop_preview_drop` | (none) | <img src="after/web/admin-games_hop_preview_drop.png" width="260"> |
| web `admin-games_hop_preview_dusk` | (none) | <img src="after/web/admin-games_hop_preview_dusk.png" width="260"> |
| web `admin-games_hop_preview_high` | (none) | <img src="after/web/admin-games_hop_preview_high.png" width="260"> |
| web `admin-games_hop_preview_jetpack` | (none) | <img src="after/web/admin-games_hop_preview_jetpack.png" width="260"> |
| web `admin-games_hop_preview_night` | (none) | <img src="after/web/admin-games_hop_preview_night.png" width="260"> |
| web `admin-games_hop_preview_onebounce` | (none) | <img src="after/web/admin-games_hop_preview_onebounce.png" width="260"> |
| web `admin-games_hop_preview_opening` | (none) | <img src="after/web/admin-games_hop_preview_opening.png" width="260"> |
| web `admin-games_hop_preview_propeller` | (none) | <img src="after/web/admin-games_hop_preview_propeller.png" width="260"> |
| web `admin-games_hop_preview_propellerleft` | (none) | <img src="after/web/admin-games_hop_preview_propellerleft.png" width="260"> |
| web `admin-games_hop_preview_spring` | (none) | <img src="after/web/admin-games_hop_preview_spring.png" width="260"> |
| web `admin-games_hop_preview_summit` | (none) | <img src="after/web/admin-games_hop_preview_summit.png" width="260"> |
| web `admin-games_leaderboard` | (none) | <img src="after/web/admin-games_leaderboard.png" width="260"> |
| web `admin-games_leaderboard_game_glider` | (none) | <img src="after/web/admin-games_leaderboard_game_glider.png" width="260"> |
| web `admin-games_leaderboard_game_hop` | (none) | <img src="after/web/admin-games_leaderboard_game_hop.png" width="260"> |
| web `admin-games_leaderboard_game_runner` | (none) | <img src="after/web/admin-games_leaderboard_game_runner.png" width="260"> |
| web `admin-games_runner` | (none) | <img src="after/web/admin-games_runner.png" width="260"> |
| web `admin-games_runner_preview_double` | (none) | <img src="after/web/admin-games_runner_preview_double.png" width="260"> |
| web `admin-games_runner_preview_hang` | (none) | <img src="after/web/admin-games_runner_preview_hang.png" width="260"> |
| web `admin-games_runner_preview_tall` | (none) | <img src="after/web/admin-games_runner_preview_tall.png" width="260"> |
| web `admin-games_runner_preview_wide` | (none) | <img src="after/web/admin-games_runner_preview_wide.png" width="260"> |
| web `admin-games_shooter` | (none) | <img src="after/web/admin-games_shooter.png" width="260"> |
| web `admin-org` | (none) | <img src="after/web/admin-org.png" width="260"> |
| web `admin-root` | (none) | <img src="after/web/admin-root.png" width="260"> |
| web `out-games` | (none) | <img src="after/web/out-games.png" width="260"> |
| web `out-games_cafe` | (none) | <img src="after/web/out-games_cafe.png" width="260"> |
| web `out-games_flappy` | (none) | <img src="after/web/out-games_flappy.png" width="260"> |
| web `out-games_glider` | (none) | <img src="after/web/out-games_glider.png" width="260"> |
| web `out-games_glider_preview_dive` | (none) | <img src="after/web/out-games_glider_preview_dive.png" width="260"> |
| web `out-games_glider_preview_high` | (none) | <img src="after/web/out-games_glider_preview_high.png" width="260"> |
| web `out-games_glider_preview_launch` | (none) | <img src="after/web/out-games_glider_preview_launch.png" width="260"> |
| web `out-games_glider_preview_night` | (none) | <img src="after/web/out-games_glider_preview_night.png" width="260"> |
| web `out-games_glider_preview_world` | (none) | <img src="after/web/out-games_glider_preview_world.png" width="260"> |
| web `out-games_glider_preview_world3` | (none) | <img src="after/web/out-games_glider_preview_world3.png" width="260"> |
| web `out-games_glider_preview_world6` | (none) | <img src="after/web/out-games_glider_preview_world6.png" width="260"> |
| web `out-games_hop` | (none) | <img src="after/web/out-games_hop.png" width="260"> |
| web `out-games_hop_preview_best` | (none) | <img src="after/web/out-games_hop_preview_best.png" width="260"> |
| web `out-games_hop_preview_break` | (none) | <img src="after/web/out-games_hop_preview_break.png" width="260"> |
| web `out-games_hop_preview_clouds` | (none) | <img src="after/web/out-games_hop_preview_clouds.png" width="260"> |
| web `out-games_hop_preview_crossed` | (none) | <img src="after/web/out-games_hop_preview_crossed.png" width="260"> |
| web `out-games_hop_preview_drop` | (none) | <img src="after/web/out-games_hop_preview_drop.png" width="260"> |
| web `out-games_hop_preview_dusk` | (none) | <img src="after/web/out-games_hop_preview_dusk.png" width="260"> |
| web `out-games_hop_preview_high` | (none) | <img src="after/web/out-games_hop_preview_high.png" width="260"> |
| web `out-games_hop_preview_jetpack` | (none) | <img src="after/web/out-games_hop_preview_jetpack.png" width="260"> |
| web `out-games_hop_preview_night` | (none) | <img src="after/web/out-games_hop_preview_night.png" width="260"> |
| web `out-games_hop_preview_onebounce` | (none) | <img src="after/web/out-games_hop_preview_onebounce.png" width="260"> |
| web `out-games_hop_preview_opening` | (none) | <img src="after/web/out-games_hop_preview_opening.png" width="260"> |
| web `out-games_hop_preview_propeller` | (none) | <img src="after/web/out-games_hop_preview_propeller.png" width="260"> |
| web `out-games_hop_preview_propellerleft` | (none) | <img src="after/web/out-games_hop_preview_propellerleft.png" width="260"> |
| web `out-games_hop_preview_spring` | (none) | <img src="after/web/out-games_hop_preview_spring.png" width="260"> |
| web `out-games_hop_preview_summit` | (none) | <img src="after/web/out-games_hop_preview_summit.png" width="260"> |
| web `out-games_leaderboard` | (none) | <img src="after/web/out-games_leaderboard.png" width="260"> |
| web `out-games_leaderboard_game_glider` | (none) | <img src="after/web/out-games_leaderboard_game_glider.png" width="260"> |
| web `out-games_leaderboard_game_hop` | (none) | <img src="after/web/out-games_leaderboard_game_hop.png" width="260"> |
| web `out-games_leaderboard_game_runner` | (none) | <img src="after/web/out-games_leaderboard_game_runner.png" width="260"> |
| web `out-games_runner` | (none) | <img src="after/web/out-games_runner.png" width="260"> |
| web `out-games_runner_preview_double` | (none) | <img src="after/web/out-games_runner_preview_double.png" width="260"> |
| web `out-games_runner_preview_hang` | (none) | <img src="after/web/out-games_runner_preview_hang.png" width="260"> |
| web `out-games_runner_preview_tall` | (none) | <img src="after/web/out-games_runner_preview_tall.png" width="260"> |
| web `out-games_runner_preview_wide` | (none) | <img src="after/web/out-games_runner_preview_wide.png" width="260"> |
| web `out-games_shooter` | (none) | <img src="after/web/out-games_shooter.png" width="260"> |
| web `out-org` | (none) | <img src="after/web/out-org.png" width="260"> |
| web `out-root` | (none) | <img src="after/web/out-root.png" width="260"> |
| ios `admin-games` | (none) | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-games_cafe` | (none) | <img src="after/ios/admin-games_cafe.png" width="260"> |
| ios `admin-games_flappy` | (none) | <img src="after/ios/admin-games_flappy.png" width="260"> |
| ios `admin-games_glider` | (none) | <img src="after/ios/admin-games_glider.png" width="260"> |
| ios `admin-games_glider_preview_dive` | (none) | <img src="after/ios/admin-games_glider_preview_dive.png" width="260"> |
| ios `admin-games_glider_preview_high` | (none) | <img src="after/ios/admin-games_glider_preview_high.png" width="260"> |
| ios `admin-games_glider_preview_launch` | (none) | <img src="after/ios/admin-games_glider_preview_launch.png" width="260"> |
| ios `admin-games_glider_preview_night` | (none) | <img src="after/ios/admin-games_glider_preview_night.png" width="260"> |
| ios `admin-games_glider_preview_world` | (none) | <img src="after/ios/admin-games_glider_preview_world.png" width="260"> |
| ios `admin-games_glider_preview_world3` | (none) | <img src="after/ios/admin-games_glider_preview_world3.png" width="260"> |
| ios `admin-games_glider_preview_world6` | (none) | <img src="after/ios/admin-games_glider_preview_world6.png" width="260"> |
| ios `admin-games_hop` | (none) | <img src="after/ios/admin-games_hop.png" width="260"> |
| ios `admin-games_hop_preview_best` | (none) | <img src="after/ios/admin-games_hop_preview_best.png" width="260"> |
| ios `admin-games_hop_preview_break` | (none) | <img src="after/ios/admin-games_hop_preview_break.png" width="260"> |
| ios `admin-games_hop_preview_clouds` | (none) | <img src="after/ios/admin-games_hop_preview_clouds.png" width="260"> |
| ios `admin-games_hop_preview_crossed` | (none) | <img src="after/ios/admin-games_hop_preview_crossed.png" width="260"> |
| ios `admin-games_hop_preview_drop` | (none) | <img src="after/ios/admin-games_hop_preview_drop.png" width="260"> |
| ios `admin-games_hop_preview_dusk` | (none) | <img src="after/ios/admin-games_hop_preview_dusk.png" width="260"> |
| ios `admin-games_hop_preview_high` | (none) | <img src="after/ios/admin-games_hop_preview_high.png" width="260"> |
| ios `admin-games_hop_preview_jetpack` | (none) | <img src="after/ios/admin-games_hop_preview_jetpack.png" width="260"> |
| ios `admin-games_hop_preview_night` | (none) | <img src="after/ios/admin-games_hop_preview_night.png" width="260"> |
| ios `admin-games_hop_preview_onebounce` | (none) | <img src="after/ios/admin-games_hop_preview_onebounce.png" width="260"> |
| ios `admin-games_hop_preview_opening` | (none) | <img src="after/ios/admin-games_hop_preview_opening.png" width="260"> |
| ios `admin-games_hop_preview_propeller` | (none) | <img src="after/ios/admin-games_hop_preview_propeller.png" width="260"> |
| ios `admin-games_hop_preview_propellerleft` | (none) | <img src="after/ios/admin-games_hop_preview_propellerleft.png" width="260"> |
| ios `admin-games_hop_preview_spring` | (none) | <img src="after/ios/admin-games_hop_preview_spring.png" width="260"> |
| ios `admin-games_hop_preview_summit` | (none) | <img src="after/ios/admin-games_hop_preview_summit.png" width="260"> |
| ios `admin-games_leaderboard` | (none) | <img src="after/ios/admin-games_leaderboard.png" width="260"> |
| ios `admin-games_leaderboard_game_glider` | (none) | <img src="after/ios/admin-games_leaderboard_game_glider.png" width="260"> |
| ios `admin-games_leaderboard_game_hop` | (none) | <img src="after/ios/admin-games_leaderboard_game_hop.png" width="260"> |
| ios `admin-games_leaderboard_game_runner` | (none) | <img src="after/ios/admin-games_leaderboard_game_runner.png" width="260"> |
| ios `admin-games_runner` | (none) | <img src="after/ios/admin-games_runner.png" width="260"> |
| ios `admin-games_runner_preview_double` | (none) | <img src="after/ios/admin-games_runner_preview_double.png" width="260"> |
| ios `admin-games_runner_preview_hang` | (none) | <img src="after/ios/admin-games_runner_preview_hang.png" width="260"> |
| ios `admin-games_runner_preview_tall` | (none) | <img src="after/ios/admin-games_runner_preview_tall.png" width="260"> |
| ios `admin-games_runner_preview_wide` | (none) | <img src="after/ios/admin-games_runner_preview_wide.png" width="260"> |
| ios `admin-games_shooter` | (none) | <img src="after/ios/admin-games_shooter.png" width="260"> |
| ios `admin-org` | (none) | <img src="after/ios/admin-org.png" width="260"> |
| ios `admin-root` | (none) | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-org` | (none) | <img src="after/ios/out-org.png" width="260"> |
| ios `out-root` | (none) | <img src="after/ios/out-root.png" width="260"> |
