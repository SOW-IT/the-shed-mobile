# verify: scoped

- because games: src/components/games/GamesMenu.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 20s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 573s |  |
| unused code (knip) | ✔ pass | 17s |  |
| typecheck | ✔ pass | 164s |  |
| related unit tests | ✔ pass | 13s |  |
| verify lock | ✔ pass | 534s | took it after waiting 534s for pid 23959, feat/mystic-man-reset in /Users/xtectra/GitHub/worktrees/the-shed-mobile-mystic-reset, since 2026-11-23T10:50:56.719Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 44s | before functions on :3270 |
| before: web | ✔ pass | 160s | 24 screens, 0 broken. |
| before: iOS reset | ✔ pass | 3s |  |
| before: iOS | ✔ pass | 168s | 14 screenshots, every one settled |
| after: local backend | ✔ pass | 68s | after functions on :3270 |
| after: web | ✔ pass | 200s | 24 screens, 0 broken. |
| after: iOS reset | ✔ pass | 5s |  |
| after: iOS | ✔ pass | 182s | 14 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-games_flappy` | <img src="before/web/admin-games_flappy.png" width="260"> | <img src="after/web/admin-games_flappy.png" width="260"> |
| web `admin-games_leaderboard` | <img src="before/web/admin-games_leaderboard.png" width="260"> | <img src="after/web/admin-games_leaderboard.png" width="260"> |
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
| web `out-games_leaderboard` | <img src="before/web/out-games_leaderboard.png" width="260"> | <img src="after/web/out-games_leaderboard.png" width="260"> |
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
| ios `admin-games_leaderboard` | <img src="before/ios/admin-games_leaderboard.png" width="260"> | <img src="after/ios/admin-games_leaderboard.png" width="260"> |
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
