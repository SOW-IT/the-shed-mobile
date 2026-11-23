# verify: scoped

- because world: src/world/Person.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 7s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 136s |  |
| unused code (knip) | ✔ pass | 8s |  |
| typecheck | ✔ pass | 46s |  |
| related unit tests | ✔ pass | 3s |  |
| verify lock | ✔ pass | 1135s | took it after waiting 1135s for pid 99779, feat/mystic-man-combos in /Users/xtectra/GitHub/worktrees/the-shed-mobile-mystic-combos, since 2026-11-23T20:18:12.615Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 19s | before functions on :3270 |
| before: web | ✔ pass | 119s | 8 screens, 0 broken. |
| before: iOS reset | ✔ pass | 3s |  |
| before: iOS | ⚠ warning | 0s | port 8092 is in use by pid 55026, which this script didn't start |
| after: local backend | ✔ pass | 38s | after functions on :3270 |
| after: web | ✔ pass | 80s | 8 screens, 0 broken. |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 131s | 6 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `admin-world` | <img src="before/web/admin-world.png" width="260"> | <img src="after/web/admin-world.png" width="260"> |
| web `out-games` | <img src="before/web/out-games.png" width="260"> | <img src="after/web/out-games.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| web `out-world` | <img src="before/web/out-world.png" width="260"> | <img src="after/web/out-world.png" width="260"> |
| ios `admin-games` | (none) | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-home` | (none) | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | (none) | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | (none) | <img src="after/ios/admin-world.png" width="260"> |
| ios `out-home` | (none) | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | (none) | <img src="after/ios/out-root.png" width="260"> |
