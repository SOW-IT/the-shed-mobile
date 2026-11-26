# verify: scoped

- because world: convex/world.ts
- because world: shared/animals.ts
- because devotionals: shared/devotionalGroups.ts
- because world: shared/farm.ts
- because world: shared/world.ts
- because world: src/world/ChatBar.tsx
- because world: src/world/ChatLog.tsx
- because world: src/world/Farm.tsx
- because world: src/world/Garden.tsx
- because world: src/world/Person.tsx
- because world: src/world/WorldScreen.tsx
- because world: src/world/palette.ts
- because world: src/worldColours.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 51s |  |
| unused code (knip) | ✔ pass | 4s |  |
| typecheck | ✔ pass | 13s |  |
| related unit tests | ✔ pass | 9s | 2182 passed (2182) |
| verify lock | ✔ pass | 14s | took it after waiting 14s for pid 87028, feat/arcade-v2 in /Users/daniel.kim/GitHub/worktrees/shed-arcade-v2, since 2026-11-26T02:30:26.883Z |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 16s | before functions on :3270 |
| before: web | ✔ pass | 146s | 28 screens, 0 broken. Checks passed: chapel-pews, arcade-podium, passage-picker-close. |
| after: local backend | ✔ pass | 16s | after functions on :3270 |
| after: web | ✔ pass | 145s | 28 screens, 0 broken. Checks passed: chapel-pews, arcade-podium, passage-picker-close. |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-devotionals` | <img src="before/web/admin-devotionals.png" width="260"> | <img src="after/web/admin-devotionals.png" width="260"> |
| web `admin-devotionals_devotionalDate` | <img src="before/web/admin-devotionals_devotionalDate.png" width="260"> | <img src="after/web/admin-devotionals_devotionalDate.png" width="260"> |
| web `admin-devotionals_devotionalEmptyDate` | <img src="before/web/admin-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/web/admin-devotionals_devotionalEmptyDate.png" width="260"> |
| web `admin-devotionals_tab_groups` | <img src="before/web/admin-devotionals_tab_groups.png" width="260"> | <img src="after/web/admin-devotionals_tab_groups.png" width="260"> |
| web `admin-games` | <img src="before/web/admin-games.png" width="260"> | <img src="after/web/admin-games.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `admin-world` | <img src="before/web/admin-world.png" width="260"> | <img src="after/web/admin-world.png" width="260"> |
| web `admin-world_calendar` | <img src="before/web/admin-world_calendar.png" width="260"> | <img src="after/web/admin-world_calendar.png" width="260"> |
| web `admin-world_devotionals` | <img src="before/web/admin-world_devotionals.png" width="260"> | <img src="after/web/admin-world_devotionals.png" width="260"> |
| web `admin-world_praise` | <img src="before/web/admin-world_praise.png" width="260"> | <img src="after/web/admin-world_praise.png" width="260"> |
| web `admin-world_sheet_arcade` | <img src="before/web/admin-world_sheet_arcade.png" width="260"> | <img src="after/web/admin-world_sheet_arcade.png" width="260"> |
| web `admin-world_sheet_character` | <img src="before/web/admin-world_sheet_character.png" width="260"> | <img src="after/web/admin-world_sheet_character.png" width="260"> |
| web `admin-world_sheet_poke` | <img src="before/web/admin-world_sheet_poke.png" width="260"> | <img src="after/web/admin-world_sheet_poke.png" width="260"> |
| web `out-devotionals` | <img src="before/web/out-devotionals.png" width="260"> | <img src="after/web/out-devotionals.png" width="260"> |
| web `out-devotionals_devotionalDate` | <img src="before/web/out-devotionals_devotionalDate.png" width="260"> | <img src="after/web/out-devotionals_devotionalDate.png" width="260"> |
| web `out-devotionals_devotionalEmptyDate` | <img src="before/web/out-devotionals_devotionalEmptyDate.png" width="260"> | <img src="after/web/out-devotionals_devotionalEmptyDate.png" width="260"> |
| web `out-devotionals_tab_groups` | <img src="before/web/out-devotionals_tab_groups.png" width="260"> | <img src="after/web/out-devotionals_tab_groups.png" width="260"> |
| web `out-games` | <img src="before/web/out-games.png" width="260"> | <img src="after/web/out-games.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| web `out-world` | <img src="before/web/out-world.png" width="260"> | <img src="after/web/out-world.png" width="260"> |
| web `out-world_calendar` | <img src="before/web/out-world_calendar.png" width="260"> | <img src="after/web/out-world_calendar.png" width="260"> |
| web `out-world_devotionals` | <img src="before/web/out-world_devotionals.png" width="260"> | <img src="after/web/out-world_devotionals.png" width="260"> |
| web `out-world_praise` | <img src="before/web/out-world_praise.png" width="260"> | <img src="after/web/out-world_praise.png" width="260"> |
| web `out-world_sheet_arcade` | <img src="before/web/out-world_sheet_arcade.png" width="260"> | <img src="after/web/out-world_sheet_arcade.png" width="260"> |
| web `out-world_sheet_character` | <img src="before/web/out-world_sheet_character.png" width="260"> | <img src="after/web/out-world_sheet_character.png" width="260"> |
| web `out-world_sheet_poke` | <img src="before/web/out-world_sheet_poke.png" width="260"> | <img src="after/web/out-world_sheet_poke.png" width="260"> |
