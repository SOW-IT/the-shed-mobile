# verify: scoped

- because world: src/world/Person.tsx
- because world: src/world/hatHeight.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 83s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 17s |  |
| related unit tests | ✔ pass | 1s | 4 passed (4) |
| verify lock | ✔ pass | 412s | took it after waiting 412s for pid 54277, feat/hill-glider in /Users/xtectra/GitHub/worktrees/the-shed-mobile-hill-glider, since 2026-11-24T11:55:00.767Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 16s | before functions on :3270 |
| before: web | ✔ pass | 106s | 16 screens, 0 broken. |
| before: iOS reset | ✔ pass | 2s |  |
| before: iOS | ✔ pass | 129s | 10 screenshots, every one settled |
| after: local backend | ✔ pass | 16s | after functions on :3270 |
| after: web | ✔ pass | 93s | 16 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 109s | 10 screenshots, every one settled |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `admin-world` | <img src="before/web/admin-world.png" width="260"> | <img src="after/web/admin-world.png" width="260"> |
| web `admin-world_calendar` | <img src="before/web/admin-world_calendar.png" width="260"> | <img src="after/web/admin-world_calendar.png" width="260"> |
| web `admin-world_praise` | <img src="before/web/admin-world_praise.png" width="260"> | <img src="after/web/admin-world_praise.png" width="260"> |
| web `admin-world_sheet_character` | <img src="before/web/admin-world_sheet_character.png" width="260"> | <img src="after/web/admin-world_sheet_character.png" width="260"> |
| web `admin-world_sheet_poke` | <img src="before/web/admin-world_sheet_poke.png" width="260"> | <img src="after/web/admin-world_sheet_poke.png" width="260"> |
| web `out-games` | <img src="before/web/out-games.png" width="260"> | <img src="after/web/out-games.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| web `out-world` | <img src="before/web/out-world.png" width="260"> | <img src="after/web/out-world.png" width="260"> |
| web `out-world_calendar` | <img src="before/web/out-world_calendar.png" width="260"> | <img src="after/web/out-world_calendar.png" width="260"> |
| web `out-world_praise` | <img src="before/web/out-world_praise.png" width="260"> | <img src="after/web/out-world_praise.png" width="260"> |
| web `out-world_sheet_character` | <img src="before/web/out-world_sheet_character.png" width="260"> | <img src="after/web/out-world_sheet_character.png" width="260"> |
| web `out-world_sheet_poke` | <img src="before/web/out-world_sheet_poke.png" width="260"> | <img src="after/web/out-world_sheet_poke.png" width="260"> |
| ios `admin-games` | <img src="before/ios/admin-games.png" width="260"> | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | <img src="before/ios/admin-world.png" width="260"> | <img src="after/ios/admin-world.png" width="260"> |
| ios `admin-world_calendar` | <img src="before/ios/admin-world_calendar.png" width="260"> | <img src="after/ios/admin-world_calendar.png" width="260"> |
| ios `admin-world_praise` | <img src="before/ios/admin-world_praise.png" width="260"> | <img src="after/ios/admin-world_praise.png" width="260"> |
| ios `admin-world_sheet_character` | <img src="before/ios/admin-world_sheet_character.png" width="260"> | <img src="after/ios/admin-world_sheet_character.png" width="260"> |
| ios `admin-world_sheet_poke` | <img src="before/ios/admin-world_sheet_poke.png" width="260"> | <img src="after/ios/admin-world_sheet_poke.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
