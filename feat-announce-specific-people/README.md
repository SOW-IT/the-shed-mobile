# verify: scoped (after merging main at 871bf16, 2.11.41)

- because --only announcements
- three runs on head 571920e, on ports 3280/3281/8103/8197 and the simulator "iPhone 17 Pro announce"

Run 1, full (web + iOS):

| Step | Result | Detail |
| --- | --- | --- |
| native fingerprint | ✔ pass | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass |  |
| typecheck | ✔ pass |  |
| before: web | ✔ pass | 6 screens, 0 broken |
| after: web | ✔ pass | 6 screens, 0 broken |
| before / after: iOS | ✔ pass | 5 + 5 screenshots, but all covered by the dev client's first-launch menu on a fresh simulator (fixed for run 2) |

Run 2, iOS (`--no-web`):

| Step | Result | Detail |
| --- | --- | --- |
| lint, typecheck | ✔ pass |  |
| before: iOS | ✔ pass | 5 screenshots |
| after: iOS | ✔ pass | 5 screenshots; the announcements link raced the sign-in redirect and landed on Home |

Run 3, iOS after only (`--no-web --no-before`):

| Step | Result | Detail |
| --- | --- | --- |
| after: iOS | ✔ pass | 5 screenshots; announcements opened |

Web screenshots are from run 1, iOS before from run 2, iOS after from run 3.

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
