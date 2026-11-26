# verify: scoped

- because world: src/world/Person.tsx
- because world: src/world/bodywear.ts
- because world: src/world/headwear.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 42s |  |
| unused code (knip) | ✔ pass | 3s |  |
| typecheck | ✔ pass | 12s |  |
| related unit tests | ✔ pass | 1s | 44 passed (44) |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 0s |  |
| before: local backend | ✔ pass | 17s | before functions on :3270 |
| before: web | ✔ pass | 118s | 20 screens, 0 broken. Checks passed: chapel-pews, arcade-podium. |
| after: local backend | ✔ pass | 18s | after functions on :3270 |
| after: web | ✔ pass | 124s | 20 screens, 0 broken. Checks passed: chapel-pews, arcade-podium. |

## Contact Sheets

### Outfits

![outfits contact sheet](contact-sheets/outfits.png)

### Hats

![hats contact sheet](contact-sheets/hats.png)

### Accessories

![accessories contact sheet](contact-sheets/accessories.png)

### Hair

![hair contact sheet](contact-sheets/hair.png)

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
