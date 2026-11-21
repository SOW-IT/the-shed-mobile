# verify: scoped

- because --only announcements

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 21s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 60s |  |
| typecheck | ✔ pass | 14s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 15s | before functions on :3280 |
| before: web | ✔ pass | 95s | 6 screens, 0 broken. |
| before: iOS reset | ✔ pass | 5s |  |
| before: iOS | ⚠ warning | 18s | Command failed: xcrun simctl openurl 0BA0266F-3B68-4DE3-B05E-FDE3B0654828 exp+the-shed-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8103 An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=60): Simulator device failed to open exp+the-shed-mobile://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8103. Operation timed out Underlying error (domain= |
| after: local backend | ✔ pass | 48s | after functions on :3280 |
| after: web | ✔ pass | 59s | 6 screens, 0 broken. |
| after: iOS reset | ✔ pass | 12s |  |
| after: iOS | ✔ pass | 367s | 5 screenshots |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-announcements` | <img src="before/web/admin-announcements.png" width="260"> | <img src="after/web/admin-announcements.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-announcements` | <img src="before/web/out-announcements.png" width="260"> | <img src="after/web/out-announcements.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-announcements` | (none) | <img src="after/ios/admin-announcements.png" width="260"> |
| ios `admin-home` | (none) | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | (none) | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | (none) | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | (none) | <img src="after/ios/out-root.png" width="260"> |
