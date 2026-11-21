# verify: scoped

- because calendar: src/app/(tabs)/calendar.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 39s |  |
| typecheck | ✔ pass | 12s |  |
| related unit tests | ✔ pass | 2s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 14s | before functions on :3270 |
| before: web | ✔ pass | 60s | 10 screens, 0 broken. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 76s | 7 screenshots |
| after: local backend | ✔ pass | 15s | after functions on :3270 |
| after: web | ✔ pass | 60s | 10 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 66s | 7 screenshots |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-calendar` | <img src="before/web/admin-calendar.png" width="260"> | <img src="after/web/admin-calendar.png" width="260"> |
| web `admin-calendar_history` | <img src="before/web/admin-calendar_history.png" width="260"> | <img src="after/web/admin-calendar_history.png" width="260"> |
| web `admin-calendar_view_week` | <img src="before/web/admin-calendar_view_week.png" width="260"> | <img src="after/web/admin-calendar_view_week.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-calendar` | <img src="before/web/out-calendar.png" width="260"> | <img src="after/web/out-calendar.png" width="260"> |
| web `out-calendar_history` | <img src="before/web/out-calendar_history.png" width="260"> | <img src="after/web/out-calendar_history.png" width="260"> |
| web `out-calendar_view_week` | <img src="before/web/out-calendar_view_week.png" width="260"> | <img src="after/web/out-calendar_view_week.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-calendar` | <img src="before/ios/admin-calendar.png" width="260"> | <img src="after/ios/admin-calendar.png" width="260"> |
| ios `admin-calendar_history` | <img src="before/ios/admin-calendar_history.png" width="260"> | <img src="after/ios/admin-calendar_history.png" width="260"> |
| ios `admin-calendar_view_week` | <img src="before/ios/admin-calendar_view_week.png" width="260"> | <img src="after/ios/admin-calendar_view_week.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
