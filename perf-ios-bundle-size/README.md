# verify: scoped

- because --only event-requests

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 5s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 69s |  |
| unused code (knip) | ✔ pass | 7s |  |
| typecheck | ✔ pass | 29s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 34s | before functions on :3270 |
| before: web | ✔ pass | 83s | 8 screens, 0 broken. |
| before: iOS reset | ✔ pass | 5s |  |
| before: iOS | ✔ pass | 137s | 6 screenshots, every one settled |
| after: local backend | ✔ pass | 26s | after functions on :3270 |
| after: web | ✔ pass | 62s | 8 screens, 0 broken. |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 73s | 6 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-event_requests` | <img src="before/web/admin-event_requests.png" width="260"> | <img src="after/web/admin-event_requests.png" width="260"> |
| web `admin-event_requests_new` | <img src="before/web/admin-event_requests_new.png" width="260"> | <img src="after/web/admin-event_requests_new.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-event_requests` | <img src="before/web/out-event_requests.png" width="260"> | <img src="after/web/out-event_requests.png" width="260"> |
| web `out-event_requests_new` | <img src="before/web/out-event_requests_new.png" width="260"> | <img src="after/web/out-event_requests_new.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-event_requests` | <img src="before/ios/admin-event_requests.png" width="260"> | <img src="after/ios/admin-event_requests.png" width="260"> |
| ios `admin-event_requests_new` | <img src="before/ios/admin-event_requests_new.png" width="260"> | <img src="after/ios/admin-event_requests_new.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
