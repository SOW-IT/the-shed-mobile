# verify: scoped

- because --only /games/hop

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 159s |  |
| unused code (knip) | ✔ pass | 6s |  |
| typecheck | ✔ pass | 25s |  |
| ports | ✔ pass | 0s | convex :3270, convexSite :3271, web :8192, metro :8092 |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 24s | before functions on :3270 |
| before: web | ✔ pass | 97s | 6 screens, 0 broken. |
| before: simulator lock | ✔ pass | 0s | free, taken at once |
| before: iOS reset | ✔ pass | 3s |  |
| before: iOS | ✔ pass | 121s | 5 screenshots, every one settled |
| after: local backend | ✔ pass | 54s | after functions on :3270 |
| after: web | ✔ pass | 105s | 6 screens, 0 broken. |
| after: simulator lock | ✔ pass | 0s | free, taken at once |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 83s | 5 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games_hop` | <img src="before/web/admin-games_hop.png" width="260"> | <img src="after/web/admin-games_hop.png" width="260"> |
| web `admin-org` | <img src="before/web/admin-org.png" width="260"> | <img src="after/web/admin-org.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-games_hop` | <img src="before/web/out-games_hop.png" width="260"> | <img src="after/web/out-games_hop.png" width="260"> |
| web `out-org` | <img src="before/web/out-org.png" width="260"> | <img src="after/web/out-org.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-games_hop` | <img src="before/ios/admin-games_hop.png" width="260"> | <img src="after/ios/admin-games_hop.png" width="260"> |
| ios `admin-org` | <img src="before/ios/admin-org.png" width="260"> | <img src="after/ios/admin-org.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-org` | <img src="before/ios/out-org.png" width="260"> | <img src="after/ios/out-org.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
