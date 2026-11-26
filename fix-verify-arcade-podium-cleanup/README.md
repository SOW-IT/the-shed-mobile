# verify: scoped

- because --only world

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 6s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 107s |  |
| unused code (knip) | ✔ pass | 7s |  |
| typecheck | ✔ pass | 27s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| after: local backend | ✔ pass | 22s | after functions on :3270 |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 274s | 12 screenshots, every one settled; checks passed: arcade-podium, chapel-pews |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| ios `admin-games` | (none) | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-home` | (none) | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-root` | (none) | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | (none) | <img src="after/ios/admin-world.png" width="260"> |
| ios `admin-world_calendar` | (none) | <img src="after/ios/admin-world_calendar.png" width="260"> |
| ios `admin-world_devotionals` | (none) | <img src="after/ios/admin-world_devotionals.png" width="260"> |
| ios `admin-world_praise` | (none) | <img src="after/ios/admin-world_praise.png" width="260"> |
| ios `admin-world_sheet_arcade` | (none) | <img src="after/ios/admin-world_sheet_arcade.png" width="260"> |
| ios `admin-world_sheet_character` | (none) | <img src="after/ios/admin-world_sheet_character.png" width="260"> |
| ios `admin-world_sheet_poke` | (none) | <img src="after/ios/admin-world_sheet_poke.png" width="260"> |
| ios `out-home` | (none) | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | (none) | <img src="after/ios/out-root.png" width="260"> |
