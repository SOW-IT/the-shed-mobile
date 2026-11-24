# verify: full

- because core: convex/_generated/api.d.ts
- because core: convex/schema.ts
- because core: src/theme.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 10s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 100s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 19s |  |
| unit tests with coverage | ✔ pass | 38s |  |
| verify lock | ✔ pass | 379s | took it after waiting 379s for pid 52262, perf/shed-request-step-actors in /Users/xtectra/GitHub/worktrees/the-shed-mobile-step-actors, since 2026-11-24T01:43:12.156Z |
| after: local backend | ✔ pass | 20s | after functions on :3270 |
| after: iOS reset | ✔ pass | 2s |  |
| after: iOS | ✔ pass | 280s | 48 screenshots; still moving after 10 frames: admin-review, admin-all, admin-world |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| ios `admin-admin` | (none) | <img src="after/ios/admin-admin.png" width="260"> |
| ios `admin-admin_tab_system` | (none) | <img src="after/ios/admin-admin_tab_system.png" width="260"> |
| ios `admin-admin_tab_teams` | (none) | <img src="after/ios/admin-admin_tab_teams.png" width="260"> |
| ios `admin-all` | (none) | <img src="after/ios/admin-all.png" width="260"> |
| ios `admin-announcements` | (none) | <img src="after/ios/admin-announcements.png" width="260"> |
| ios `admin-attendance` | (none) | <img src="after/ios/admin-attendance.png" width="260"> |
| ios `admin-attendance_event_eventId` | (none) | <img src="after/ios/admin-attendance_event_eventId.png" width="260"> |
| ios `admin-attendance_member_member_3A_memberId` | (none) | <img src="after/ios/admin-attendance_member_member_3A_memberId.png" width="260"> |
| ios `admin-attendance_merges` | (none) | <img src="after/ios/admin-attendance_merges.png" width="260"> |
| ios `admin-calendar` | (none) | <img src="after/ios/admin-calendar.png" width="260"> |
| ios `admin-calendar_history` | (none) | <img src="after/ios/admin-calendar_history.png" width="260"> |
| ios `admin-calendar_view_week` | (none) | <img src="after/ios/admin-calendar_view_week.png" width="260"> |
| ios `admin-checkin_checkInToken` | (none) | <img src="after/ios/admin-checkin_checkInToken.png" width="260"> |
| ios `admin-churches` | (none) | <img src="after/ios/admin-churches.png" width="260"> |
| ios `admin-design_requests` | (none) | <img src="after/ios/admin-design_requests.png" width="260"> |
| ios `admin-design_requests_new` | (none) | <img src="after/ios/admin-design_requests_new.png" width="260"> |
| ios `admin-edit_home` | (none) | <img src="after/ios/admin-edit_home.png" width="260"> |
| ios `admin-event_requests` | (none) | <img src="after/ios/admin-event_requests.png" width="260"> |
| ios `admin-event_requests_new` | (none) | <img src="after/ios/admin-event_requests_new.png" width="260"> |
| ios `admin-finance_settings` | (none) | <img src="after/ios/admin-finance_settings.png" width="260"> |
| ios `admin-games` | (none) | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-games_flappy` | (none) | <img src="after/ios/admin-games_flappy.png" width="260"> |
| ios `admin-games_leaderboard` | (none) | <img src="after/ios/admin-games_leaderboard.png" width="260"> |
| ios `admin-games_leaderboard_game_runner` | (none) | <img src="after/ios/admin-games_leaderboard_game_runner.png" width="260"> |
| ios `admin-games_runner` | (none) | <img src="after/ios/admin-games_runner.png" width="260"> |
| ios `admin-games_runner_preview_double` | (none) | <img src="after/ios/admin-games_runner_preview_double.png" width="260"> |
| ios `admin-games_runner_preview_hang` | (none) | <img src="after/ios/admin-games_runner_preview_hang.png" width="260"> |
| ios `admin-games_runner_preview_tall` | (none) | <img src="after/ios/admin-games_runner_preview_tall.png" width="260"> |
| ios `admin-games_runner_preview_wide` | (none) | <img src="after/ios/admin-games_runner_preview_wide.png" width="260"> |
| ios `admin-games_shooter` | (none) | <img src="after/ios/admin-games_shooter.png" width="260"> |
| ios `admin-grievances` | (none) | <img src="after/ios/admin-grievances.png" width="260"> |
| ios `admin-grievances_new` | (none) | <img src="after/ios/admin-grievances_new.png" width="260"> |
| ios `admin-grievances_tab_settings` | (none) | <img src="after/ios/admin-grievances_tab_settings.png" width="260"> |
| ios `admin-home` | (none) | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-insights_tab_attendance` | (none) | <img src="after/ios/admin-insights_tab_attendance.png" width="260"> |
| ios `admin-insights_tab_general` | (none) | <img src="after/ios/admin-insights_tab_general.png" width="260"> |
| ios `admin-mentoring` | (none) | <img src="after/ios/admin-mentoring.png" width="260"> |
| ios `admin-music` | (none) | <img src="after/ios/admin-music.png" width="260"> |
| ios `admin-notifications` | (none) | <img src="after/ios/admin-notifications.png" width="260"> |
| ios `admin-org` | (none) | <img src="after/ios/admin-org.png" width="260"> |
| ios `admin-profile` | (none) | <img src="after/ios/admin-profile.png" width="260"> |
| ios `admin-review` | (none) | <img src="after/ios/admin-review.png" width="260"> |
| ios `admin-root` | (none) | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | (none) | <img src="after/ios/admin-world.png" width="260"> |
| ios `admin-world_sheet_character` | (none) | <img src="after/ios/admin-world_sheet_character.png" width="260"> |
| ios `admin-world_sheet_poke` | (none) | <img src="after/ios/admin-world_sheet_poke.png" width="260"> |
| ios `out-home` | (none) | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | (none) | <img src="after/ios/out-root.png" width="260"> |
