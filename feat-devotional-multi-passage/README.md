# verify: scoped

- because devotionals: shared/bible.ts
- because devotionals: shared/devotionals.ts
- because devotionals: src/components/devotionals/DevotionalEditor.tsx
- because devotionals: src/components/devotionals/PassagePicker.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 1s |  |
| native fingerprint | ✔ pass | 9s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 178s |  |
| unused code (knip) | ✔ pass | 7s |  |
| typecheck | ✔ pass | 25s |  |
| related unit tests | ✔ pass | 18s | 1989 passed (1989) |
| verify lock | ✔ pass | 2198s | took it after waiting 2198s for pid 27290, feat/world-fullscreen-web in /Users/xtectra/GitHub/worktrees/world-fullscreen, since 2026-11-27T09:56:15.980Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 33s | before functions on :3270 |
| before: web | ⚠ warning | 279s | 12 screens, 0 broken.; check passage-multi failed: ✘ TimeoutError: locator.click: Timeout 60000ms exceeded. |
| after: local backend | ✔ pass | 67s | after functions on :3270 |
| after: web | ✔ pass | 240s | 12 screens, 0 broken. Checks passed: passage-picker-close, passage-multi. |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-devotionals` | <img src="before/web/admin-devotionals.png" width="260"> | <img src="after/web/admin-devotionals.png" width="260"> |
| web `admin-devotionals_devotionalDate` | <img src="before/web/admin-devotionals_devotionalDate.png" width="260"> | <img src="after/web/admin-devotionals_devotionalDate.png" width="260"> |
| web `admin-devotionals_devotionalEmptyDate` | <img src="before/web/admin-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/web/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| web `admin-devotionals_tab_groups` | <img src="before/web/admin-devotionals_tab_groups.png" width="260"> | <img src="after/web/admin-devotionals_tab_groups.png" width="260"> |
| web `admin-org` | <img src="before/web/admin-org.png" width="260"> | <img src="after/web/admin-org.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-devotionals` | <img src="before/web/out-devotionals.png" width="260"> | <img src="after/web/out-devotionals.png" width="260"> |
| web `out-devotionals_devotionalDate` | <img src="before/web/out-devotionals_devotionalDate.png" width="260"> | <img src="after/web/out-devotionals_devotionalDate.png" width="260"> |
| web `out-devotionals_devotionalEmptyDate` | <img src="before/web/out-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/web/out-devotionals_devotionalEmptyDate.png" width="260"> |
| web `out-devotionals_tab_groups` | <img src="before/web/out-devotionals_tab_groups.png" width="260"> | <img src="after/web/out-devotionals_tab_groups.png" width="260"> |
| web `out-org` | <img src="before/web/out-org.png" width="260"> | <img src="after/web/out-org.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
