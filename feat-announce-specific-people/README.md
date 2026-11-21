# verify: scoped

- because --only announcements

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 12s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 89s |  |
| typecheck | ✔ pass | 16s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 17s | before functions on :3280 |
| before: web | ✔ pass | 57s | 6 screens, 0 broken. |
| before: iOS reset | ✔ pass | 17s |  |
| before: iOS | ✔ pass | 101s | 5 screenshots |
| after: local backend | ✔ pass | 17s | after functions on :3280 |
| after: web | ✔ pass | 59s | 6 screens, 0 broken. |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 75s | 5 screenshots |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-announcements` | <img src="before/web/admin-announcements.png" width="260"> | <img src="after/web/admin-announcements.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-announcements` | <img src="before/web/out-announcements.png" width="260"> | <img src="after/web/out-announcements.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-announcements` | <img src="before/ios/admin-announcements.png" width="260"> | <img src="after/ios/admin-announcements.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
