# verify: scoped

- because world: src/world/Person.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 1s |  |
| native fingerprint | ✔ pass | 22s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 368s |  |
| unused code (knip) | ✔ pass | 25s |  |
| typecheck | ✔ pass | 71s |  |
| related unit tests | ✔ pass | 8s |  |
| verify lock | ✔ pass | 434s | took it after waiting 434s for pid 70876, HEAD in /Users/xtectra/GitHub/worktrees/the-shed-mobile-nightly-2026-11-24, since 2026-11-23T16:03:50.816Z |
| Playwright Chromium | ✔ pass | 3s |  |
| before: local backend | ✔ pass | 41s | before functions on :3270 |
| before: web | ✔ pass | 151s | 8 screens, 0 broken. |
| before: iOS reset | ✔ pass | 30s |  |
| before: iOS | ✔ pass | 155s | 6 screenshots; still moving after 10 frames: admin-world |
| after: local backend | ✔ pass | 84s | after functions on :3270 |
| after: web | ✔ pass | 152s | 8 screens, 0 broken. |
| after: iOS reset | ✔ pass | 47s |  |
| after: iOS | ✔ pass | 107s | 6 screenshots, every one settled |

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
| ios `admin-games` | <img src="before/ios/admin-games.png" width="260"> | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | <img src="before/ios/admin-world.png" width="260"> | <img src="after/ios/admin-world.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
