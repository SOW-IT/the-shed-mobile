# verify: scoped

- because --only profile

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 46s |  |
| unused code (knip) | ✔ pass | 4s |  |
| typecheck | ✔ pass | 13s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 15s | before functions on :3270 |
| before: web | ✔ pass | 54s | 6 screens, 0 broken. |
| before: iOS reset | ✔ pass | 2s |  |
| before: iOS | ✔ pass | 75s | 5 screenshots, every one settled |
| after: local backend | ✔ pass | 16s | after functions on :3270 |
| after: web | ✔ pass | 62s | 6 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 69s | 5 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-profile` | <img src="before/web/admin-profile.png" width="260"> | <img src="after/web/admin-profile.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-profile` | <img src="before/web/out-profile.png" width="260"> | <img src="after/web/out-profile.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-profile` | <img src="before/ios/admin-profile.png" width="260"> | <img src="after/ios/admin-profile.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
