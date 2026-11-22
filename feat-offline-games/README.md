# verify: scoped

- because --only games

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 62s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 17s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 18s | before functions on :3270 |
| before: web | ⚠ warning | 94s | 16 screens, 12 broken. out     /games                                               BROKEN, 1 console error(s) out     /games/shooter                                       BROKEN, 1 console error(s) out     /games/runner                                        BROKEN, 1 console error(s) out     /games/flappy                                        BROKEN, 1 console error(s) out     /games/leaderboar |
| before: iOS reset | ✔ pass | 3s |  |
| before: iOS | ✔ pass | 114s | 10 screenshots, every one settled |
| after: local backend | ✔ pass | 21s | after functions on :3270 |
| after: web | ✔ pass | 103s | 16 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 102s | 10 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-games_flappy` | <img src="before/web/admin-games_flappy.png" width="260"> | <img src="after/web/admin-games_flappy.png" width="260"> |
| web `admin-games_leaderboard` | <img src="before/web/admin-games_leaderboard.png" width="260"> | <img src="after/web/admin-games_leaderboard.png" width="260"> |
| web `admin-games_leaderboard_game_runner` | <img src="before/web/admin-games_leaderboard_game_runner.png" width="260"> | <img src="after/web/admin-games_leaderboard_game_runner.png" width="260"> |
| web `admin-games_runner` | <img src="before/web/admin-games_runner.png" width="260"> | <img src="after/web/admin-games_runner.png" width="260"> |
| web `admin-games_shooter` | <img src="before/web/admin-games_shooter.png" width="260"> | <img src="after/web/admin-games_shooter.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-games` | <img src="before/web/out-games.png" width="260"> | <img src="after/web/out-games.png" width="260"> |
| web `out-games_flappy` | <img src="before/web/out-games_flappy.png" width="260"> | <img src="after/web/out-games_flappy.png" width="260"> |
| web `out-games_leaderboard` | <img src="before/web/out-games_leaderboard.png" width="260"> | <img src="after/web/out-games_leaderboard.png" width="260"> |
| web `out-games_leaderboard_game_runner` | <img src="before/web/out-games_leaderboard_game_runner.png" width="260"> | <img src="after/web/out-games_leaderboard_game_runner.png" width="260"> |
| web `out-games_runner` | <img src="before/web/out-games_runner.png" width="260"> | <img src="after/web/out-games_runner.png" width="260"> |
| web `out-games_shooter` | <img src="before/web/out-games_shooter.png" width="260"> | <img src="after/web/out-games_shooter.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-games` | <img src="before/ios/admin-games.png" width="260"> | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-games_flappy` | <img src="before/ios/admin-games_flappy.png" width="260"> | <img src="after/ios/admin-games_flappy.png" width="260"> |
| ios `admin-games_leaderboard` | <img src="before/ios/admin-games_leaderboard.png" width="260"> | <img src="after/ios/admin-games_leaderboard.png" width="260"> |
| ios `admin-games_leaderboard_game_runner` | <img src="before/ios/admin-games_leaderboard_game_runner.png" width="260"> | <img src="after/ios/admin-games_leaderboard_game_runner.png" width="260"> |
| ios `admin-games_runner` | <img src="before/ios/admin-games_runner.png" width="260"> | <img src="after/ios/admin-games_runner.png" width="260"> |
| ios `admin-games_shooter` | <img src="before/ios/admin-games_shooter.png" width="260"> | <img src="after/ios/admin-games_shooter.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
