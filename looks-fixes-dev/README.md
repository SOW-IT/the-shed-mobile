# verify: scoped

- because --only /dev-looks?set=ios&z=27

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 1s |  |
| native fingerprint | ✔ pass | 12s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 183s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 18s |  |
| verify lock | ✔ pass | 1700s | took it after waiting 1700s for pid 73546, perf/shed-web-pdf-lazy in /Users/xtectra/GitHub/worktrees/the-shed-mobile-perf-audit, since 2026-11-23T11:17:42.572Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 48s | before functions on :3270 |
| before: web | ✔ pass | 85s | 6 screens, 0 broken. |
| before: iOS reset | ✔ pass | 7s |  |
| before: iOS | ✔ pass | 138s | 5 screenshots, every one settled |
| after: local backend | ✔ pass | 19s | after functions on :3270 |
| after: web | ✔ pass | 72s | 6 screens, 0 broken. |
| after: iOS reset | ✔ pass | 3s |  |
| after: iOS | ✔ pass | 100s | 5 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-dev_looks_set_ios_z_27` | <img src="before/web/admin-dev_looks_set_ios_z_27.png" width="260"> | <img src="after/web/admin-dev_looks_set_ios_z_27.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-dev_looks_set_ios_z_27` | <img src="before/web/out-dev_looks_set_ios_z_27.png" width="260"> | <img src="after/web/out-dev_looks_set_ios_z_27.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-dev_looks_set_ios_z_27` | <img src="before/ios/admin-dev_looks_set_ios_z_27.png" width="260"> | <img src="after/ios/admin-dev_looks_set_ios_z_27.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
