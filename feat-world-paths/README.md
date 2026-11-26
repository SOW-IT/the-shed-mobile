# verify: scoped

- because world: convex/world.ts
- because world: shared/coins.ts
- because world: shared/world.ts
- because world: src/world/Coins.tsx
- because world: src/world/Farm.tsx
- because world: src/world/Garden.tsx
- because world: src/world/Overlays.tsx
- because world: src/world/People.tsx
- because world: src/world/Person.tsx
- because world: src/world/WorldScreen.tsx
- because world: src/world/cards.ts
- because world: src/world/palette.ts
- because world: src/world/placeScenes.ts
- because world: src/world/talk.ts
- because world: src/world/useWorld.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 1s |  |
| native fingerprint | ✔ pass | 8s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 74s |  |
| unused code (knip) | ✔ pass | 4s |  |
| typecheck | ✔ pass | 14s |  |
| related unit tests | ✔ pass | 10s | 2174 passed (2174) |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 17s | before functions on :3280 |
| before: web | ⚠ warning | 156s | 20 screens, 0 broken.; check chapel-pews failed: ✘ pew: Devotionals didn't ask |
| after: local backend | ✔ pass | 19s | after functions on :3280 |
| after: web | ✔ pass | 144s | 20 screens, 0 broken. Checks passed: chapel-pews, arcade-podium. |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
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
