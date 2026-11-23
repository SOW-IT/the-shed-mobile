# verify: scoped

- because design-requests: src/app/design-requests/[id].tsx
- because event-requests: src/app/event-requests/[id]/index.tsx
- because design-requests, event-requests: src/lib/requestPdfs.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 6s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 181s |  |
| unused code (knip) | ✔ pass | 12s |  |
| typecheck | ✔ pass | 40s |  |
| related unit tests | ✔ pass | 4s |  |
| verify lock | ✔ pass | 288s | took it after waiting 288s for pid 36327, feat/games-header-leaderboard in /Users/xtectra/GitHub/worktrees/the-shed-mobile-games-header, since 2026-11-23T11:03:49.036Z |
| Playwright Chromium | ✔ pass | 3s |  |
| before: local backend | ✔ pass | 25s | before functions on :3280 |
| before: web | ✔ pass | 162s | 12 screens, 0 broken. |
| before: iOS reset | ✔ pass | 243s |  |
| before: iOS | ⚠ warning | 1246s | maestro failed, see .verify/run/before/logs/maestro.log Assert that "(?i).*(something went wrong\|configuration error\|unmatched route\|\(ESC\)).*" is not visible... COMPLETED Assert that "(?i).*(something went wrong\|configuration error\|unmatched route\|\(ESC\)).*" is not visible... COMPLETED Assert that "Sign in" is not visible... COMPLETED Assert that "Sign in" is not visible... COMPLETED |
| after: local backend | ✔ pass | 21s | after functions on :3280 |
| after: web | ✔ pass | 98s | 12 screens, 0 broken. |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 111s | 8 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-design_requests` | <img src="before/web/admin-design_requests.png" width="260"> | <img src="after/web/admin-design_requests.png" width="260"> |
| web `admin-design_requests_new` | <img src="before/web/admin-design_requests_new.png" width="260"> | <img src="after/web/admin-design_requests_new.png" width="260"> |
| web `admin-event_requests` | <img src="before/web/admin-event_requests.png" width="260"> | <img src="after/web/admin-event_requests.png" width="260"> |
| web `admin-event_requests_new` | <img src="before/web/admin-event_requests_new.png" width="260"> | <img src="after/web/admin-event_requests_new.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-design_requests` | <img src="before/web/out-design_requests.png" width="260"> | <img src="after/web/out-design_requests.png" width="260"> |
| web `out-design_requests_new` | <img src="before/web/out-design_requests_new.png" width="260"> | <img src="after/web/out-design_requests_new.png" width="260"> |
| web `out-event_requests` | <img src="before/web/out-event_requests.png" width="260"> | <img src="after/web/out-event_requests.png" width="260"> |
| web `out-event_requests_new` | <img src="before/web/out-event_requests_new.png" width="260"> | <img src="after/web/out-event_requests_new.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-design_requests` | <img src="before/ios/admin-design_requests.png" width="260"> | <img src="after/ios/admin-design_requests.png" width="260"> |
| ios `admin-design_requests_new` | <img src="before/ios/admin-design_requests_new.png" width="260"> | <img src="after/ios/admin-design_requests_new.png" width="260"> |
| ios `admin-event_requests` | (none) | <img src="after/ios/admin-event_requests.png" width="260"> |
| ios `admin-event_requests_new` | (none) | <img src="after/ios/admin-event_requests_new.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
