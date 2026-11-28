# verify: scoped

- because --only devotionals

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 126s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 23s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| after: local backend | ✔ pass | 21s | after functions on :3270 |
| after: web | ✔ pass | 102s | 12 screens, 0 broken. Checks passed: passage-picker-close, passage-multi. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 184s | 8 screenshots, every one settled; checks passed: passage-picker-close |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-devotionals` | (none) | <img src="after/web/admin-devotionals.png" width="260"> |
| web `admin-devotionals_devotionalDate` | (none) | <img src="after/web/admin-devotionals_devotionalDate.png" width="260"> |
| web `admin-devotionals_devotionalEmptyDate` | (none) | <img src="after/web/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| web `admin-devotionals_tab_groups` | (none) | <img src="after/web/admin-devotionals_tab_groups.png" width="260"> |
| web `admin-org` | (none) | <img src="after/web/admin-org.png" width="260"> |
| web `admin-root` | (none) | <img src="after/web/admin-root.png" width="260"> |
| web `out-devotionals` | (none) | <img src="after/web/out-devotionals.png" width="260"> |
| web `out-devotionals_devotionalDate` | (none) | <img src="after/web/out-devotionals_devotionalDate.png" width="260"> |
| web `out-devotionals_devotionalEmptyDate` | (none) | <img src="after/web/out-devotionals_devotionalEmptyDate.png" width="260"> |
| web `out-devotionals_tab_groups` | (none) | <img src="after/web/out-devotionals_tab_groups.png" width="260"> |
| web `out-org` | (none) | <img src="after/web/out-org.png" width="260"> |
| web `out-root` | (none) | <img src="after/web/out-root.png" width="260"> |
| ios `admin-devotionals` | (none) | <img src="after/ios/admin-devotionals.png" width="260"> |
| ios `admin-devotionals_devotionalDate` | (none) | <img src="after/ios/admin-devotionals_devotionalDate.png" width="260"> |
| ios `admin-devotionals_devotionalEmptyDate` | (none) | <img src="after/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| ios `admin-devotionals_tab_groups` | (none) | <img src="after/ios/admin-devotionals_tab_groups.png" width="260"> |
| ios `admin-org` | (none) | <img src="after/ios/admin-org.png" width="260"> |
| ios `admin-root` | (none) | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-org` | (none) | <img src="after/ios/out-org.png" width="260"> |
| ios `out-root` | (none) | <img src="after/ios/out-root.png" width="260"> |
