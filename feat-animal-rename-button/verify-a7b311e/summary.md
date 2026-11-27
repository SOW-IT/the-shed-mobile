# verify: scoped

- because --only world

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 119s |  |
| unused code (knip) | ✔ pass | 6s |  |
| typecheck | ✔ pass | 57s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 20s | before functions on :3270 |
| before: web | ⚠ warning | 298s | 20 screens, 0 broken, still moving: admin-world, admin-world_sheet_poke, admin-world_sheet_arcade.; check steps-drag failed: ✘ Error: page.goto: net::ERR_ABORTED at http://localhost:8192/world?sheet=character |
| after: local backend | ✔ pass | 18s | after functions on :3270 |
| after: web | ✘ fail | 379s | 20 screens, 0 broken, still moving: admin-world, admin-world_sheet_poke, admin-world_sheet_arcade.; check mahjong failed: ✘ watcher: sitting in a bot's seat didn't ask to take it over |
