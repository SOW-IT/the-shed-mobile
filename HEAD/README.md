# verify: scoped

- because --only devotionals

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 66s |  |
| unused code (knip) | ✔ pass | 6s |  |
| typecheck | ✔ pass | 17s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| before: local backend | ✔ pass | 16s | before functions on :3270 |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 140s | 8 screenshots, every one settled; checks passed: passage-picker-close |
| after: local backend | ✔ pass | 16s | after functions on :3270 |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 137s | 8 screenshots, every one settled; checks passed: passage-picker-close |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| ios `admin-devotionals` | <img src="before/ios/admin-devotionals.png" width="260"> | <img src="after/ios/admin-devotionals.png" width="260"> |
| ios `admin-devotionals_devotionalDate` | <img src="before/ios/admin-devotionals_devotionalDate.png" width="260"> | <img src="after/ios/admin-devotionals_devotionalDate.png" width="260"> |
| ios `admin-devotionals_devotionalEmptyDate` | <img src="before/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| ios `admin-devotionals_tab_groups` | <img src="before/ios/admin-devotionals_tab_groups.png" width="260"> | <img src="after/ios/admin-devotionals_tab_groups.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
