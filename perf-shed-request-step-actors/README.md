# verify: scoped

- because reimbursements: convex/requests.ts
- because reimbursements: shared/flow.ts
- because reimbursements: src/components/AllRequestsList.tsx
- because reimbursements: src/components/MyRequests.tsx
- because reimbursements: src/components/RequestCard.tsx
- because reimbursements: src/components/ReviewList.tsx
- because reimbursements: src/hooks/useRequestStepActors.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 15s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 280s |  |
| unused code (knip) | ✔ pass | 12s |  |
| typecheck | ✔ pass | 47s |  |
| related unit tests | ✔ pass | 32s | 2020 passed (2020) |
| verify lock | ✔ pass | 1239s | took it after waiting 1239s for pid 75923, HEAD in /Users/xtectra/GitHub/worktrees/the-shed-mobile-nightly-2026-11-24, since 2026-11-23T16:46:58.739Z |
| Playwright Chromium | ✔ pass | 2s |  |
| before: local backend | ✔ pass | 19s | before functions on :3270 |
| before: web | ✔ pass | 84s | 10 screens, 0 broken, still moving: admin-review, admin-all. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 95s | 7 screenshots; still moving after 10 frames: admin-review, admin-all |
| after: local backend | ✔ pass | 22s | after functions on :3270 |
| after: web | ✔ pass | 114s | 10 screens, 0 broken, still moving: admin-review, admin-all. |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 102s | 7 screenshots; still moving after 10 frames: admin-review, admin-all |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-all` | <img src="before/web/admin-all.png" width="260"> | <img src="after/web/admin-all.png" width="260"> |
| web `admin-finance_settings` | <img src="before/web/admin-finance_settings.png" width="260"> | <img src="after/web/admin-finance_settings.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-review` | <img src="before/web/admin-review.png" width="260"> | <img src="after/web/admin-review.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-all` | <img src="before/web/out-all.png" width="260"> | <img src="after/web/out-all.png" width="260"> |
| web `out-finance_settings` | <img src="before/web/out-finance_settings.png" width="260"> | <img src="after/web/out-finance_settings.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-review` | <img src="before/web/out-review.png" width="260"> | <img src="after/web/out-review.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-all` | <img src="before/ios/admin-all.png" width="260"> | <img src="after/ios/admin-all.png" width="260"> |
| ios `admin-finance_settings` | <img src="before/ios/admin-finance_settings.png" width="260"> | <img src="after/ios/admin-finance_settings.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-review` | <img src="before/ios/admin-review.png" width="260"> | <img src="after/ios/admin-review.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
