# verify: scoped

- because --only announcements

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 5s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 60s |  |
| typecheck | ✔ pass | 20s |  |
| before: local backend | ✔ pass | 22s | before functions on :3280 |
| before: iOS reset | ✔ pass | 3s |  |
| before: iOS | ✔ pass | 187s | 5 screenshots |
| after: local backend | ✔ pass | 35s | after functions on :3280 |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 144s | 5 screenshots |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| ios `admin-announcements` | <img src="before/ios/admin-announcements.png" width="260"> | <img src="after/ios/admin-announcements.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
