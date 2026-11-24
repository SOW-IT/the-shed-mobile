# verify: scoped

- because devotionals: shared/bible.ts
- because devotionals: src/components/devotionals/DevotionalEditor.tsx
- because devotionals: src/components/devotionals/PassagePicker.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 5s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 79s |  |
| unused code (knip) | ✔ pass | 6s |  |
| typecheck | ✔ pass | 18s |  |
| related unit tests | ✔ pass | 16s | 1662 passed (1662) |
| verify lock | ✔ pass | 759s | took it after waiting 759s for pid 48961, feat/coins-top3 in /Users/xtectra/GitHub/worktrees/the-shed-mobile-coins-top3, since 2026-11-24T16:59:41.225Z |
| before: local backend | ✔ pass | 19s | before functions on :3270 |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 71s | 7 screenshots, every one settled |
| after: local backend | ✔ pass | 65s | after functions on :3270 |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 73s | 7 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| ios `admin-devotionals` | <img src="before/ios/admin-devotionals.png" width="260"> | <img src="after/ios/admin-devotionals.png" width="260"> |
| ios `admin-devotionals_devotionalDate` | <img src="before/ios/admin-devotionals_devotionalDate.png" width="260"> | <img src="after/ios/admin-devotionals_devotionalDate.png" width="260"> |
| ios `admin-devotionals_devotionalEmptyDate` | <img src="before/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/ios/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
