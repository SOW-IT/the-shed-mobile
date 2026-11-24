# verify: scoped

- because devotionals: shared/bible.ts
- because devotionals: src/components/devotionals/DevotionalEditor.tsx
- because devotionals: src/components/devotionals/PassagePicker.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 10s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 77s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 18s |  |
| related unit tests | ✔ pass | 16s | 1662 passed (1662) |
| verify lock | ✔ pass | 2066s | took it after waiting 2066s for pid 47158, fix/swoop-status-bar-sij-face in /Users/xtectra/GitHub/worktrees/the-shed-mobile-hill-glider, since 2026-11-24T16:15:18.804Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 17s | before functions on :3270 |
| before: web | ✔ pass | 66s | 10 screens, 0 broken. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 73s | 7 screenshots, every one settled |
| after: local backend | ✔ pass | 17s | after functions on :3270 |
| after: web | ✔ pass | 64s | 10 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 72s | 7 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-devotionals` | <img src="before/web/admin-devotionals.png" width="260"> | <img src="after/web/admin-devotionals.png" width="260"> |
| web `admin-devotionals_devotionalDate` | <img src="before/web/admin-devotionals_devotionalDate.png" width="260"> | <img src="after/web/admin-devotionals_devotionalDate.png" width="260"> |
| web `admin-devotionals_devotionalEmptyDate` | <img src="before/web/admin-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/web/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-devotionals` | <img src="before/web/out-devotionals.png" width="260"> | <img src="after/web/out-devotionals.png" width="260"> |
| web `out-devotionals_devotionalDate` | <img src="before/web/out-devotionals_devotionalDate.png" width="260"> | <img src="after/web/out-devotionals_devotionalDate.png" width="260"> |
| web `out-devotionals_devotionalEmptyDate` | <img src="before/web/out-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/web/out-devotionals_devotionalEmptyDate.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-devotionals` | <img src="before/ios/admin-devotionals.png" width="260"> | <img src="after/ios/admin-devotionals.png" width="260"> |
| ios `admin-devotionals_devotionalDate` | <img src="before/ios/admin-devotionals_devotionalDate.png" width="260"> | <img src="after/ios/admin-devotionals_devotionalDate.png" width="260"> |
| ios `admin-devotionals_devotionalEmptyDate` | <img src="before/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
