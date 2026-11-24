# verify: full

- because core: src/theme.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 71s |  |
| unused code (knip) | ✔ pass | 5s |  |
| typecheck | ✔ pass | 15s |  |
| unit tests with coverage | ✔ pass | 34s |  |
| verify lock | ✔ pass | 0s | free, taken at once |
| before: local backend | ✔ pass | 20s | before functions on :3270 |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 410s | 57 screenshots; still moving after 10 frames: admin-review, admin-all |
| after: local backend | ✔ pass | 18s | after functions on :3270 |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 395s | 57 screenshots; still moving after 10 frames: admin-review, admin-all |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| ios `admin-admin` | <img src="before/ios/admin-admin.png" width="260"> | <img src="after/ios/admin-admin.png" width="260"> |
| ios `admin-admin_tab_system` | <img src="before/ios/admin-admin_tab_system.png" width="260"> | <img src="after/ios/admin-admin_tab_system.png" width="260"> |
| ios `admin-admin_tab_teams` | <img src="before/ios/admin-admin_tab_teams.png" width="260"> | <img src="after/ios/admin-admin_tab_teams.png" width="260"> |
| ios `admin-all` | <img src="before/ios/admin-all.png" width="260"> | <img src="after/ios/admin-all.png" width="260"> |
| ios `admin-announcements` | <img src="before/ios/admin-announcements.png" width="260"> | <img src="after/ios/admin-announcements.png" width="260"> |
| ios `admin-attendance` | <img src="before/ios/admin-attendance.png" width="260"> | <img src="after/ios/admin-attendance.png" width="260"> |
| ios `admin-attendance_event_eventId` | <img src="before/ios/admin-attendance_event_eventId.png" width="260"> | <img src="after/ios/admin-attendance_event_eventId.png" width="260"> |
| ios `admin-attendance_member_member_3A_memberId` | <img src="before/ios/admin-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/ios/admin-attendance_member_member_3A_memberId.png" width="260"> |
| ios `admin-attendance_merges` | <img src="before/ios/admin-attendance_merges.png" width="260"> | <img src="after/ios/admin-attendance_merges.png" width="260"> |
| ios `admin-calendar` | <img src="before/ios/admin-calendar.png" width="260"> | <img src="after/ios/admin-calendar.png" width="260"> |
| ios `admin-calendar_history` | <img src="before/ios/admin-calendar_history.png" width="260"> | <img src="after/ios/admin-calendar_history.png" width="260"> |
| ios `admin-calendar_view_week` | <img src="before/ios/admin-calendar_view_week.png" width="260"> | <img src="after/ios/admin-calendar_view_week.png" width="260"> |
| ios `admin-checkin_checkInToken` | <img src="before/ios/admin-checkin_checkInToken.png" width="260"> | <img src="after/ios/admin-checkin_checkInToken.png" width="260"> |
| ios `admin-churches` | <img src="before/ios/admin-churches.png" width="260"> | <img src="after/ios/admin-churches.png" width="260"> |
| ios `admin-design_requests` | <img src="before/ios/admin-design_requests.png" width="260"> | <img src="after/ios/admin-design_requests.png" width="260"> |
| ios `admin-design_requests_new` | <img src="before/ios/admin-design_requests_new.png" width="260"> | <img src="after/ios/admin-design_requests_new.png" width="260"> |
| ios `admin-devotionals` | <img src="before/ios/admin-devotionals.png" width="260"> | <img src="after/ios/admin-devotionals.png" width="260"> |
| ios `admin-edit_home` | <img src="before/ios/admin-edit_home.png" width="260"> | <img src="after/ios/admin-edit_home.png" width="260"> |
| ios `admin-event_requests` | <img src="before/ios/admin-event_requests.png" width="260"> | <img src="after/ios/admin-event_requests.png" width="260"> |
| ios `admin-event_requests_new` | <img src="before/ios/admin-event_requests_new.png" width="260"> | <img src="after/ios/admin-event_requests_new.png" width="260"> |
| ios `admin-finance_settings` | <img src="before/ios/admin-finance_settings.png" width="260"> | <img src="after/ios/admin-finance_settings.png" width="260"> |
| ios `admin-games` | <img src="before/ios/admin-games.png" width="260"> | <img src="after/ios/admin-games.png" width="260"> |
| ios `admin-games_flappy` | <img src="before/ios/admin-games_flappy.png" width="260"> | <img src="after/ios/admin-games_flappy.png" width="260"> |
| ios `admin-games_glider` | <img src="before/ios/admin-games_glider.png" width="260"> | <img src="after/ios/admin-games_glider.png" width="260"> |
| ios `admin-games_glider_preview_dive` | <img src="before/ios/admin-games_glider_preview_dive.png" width="260"> | <img src="after/ios/admin-games_glider_preview_dive.png" width="260"> |
| ios `admin-games_glider_preview_launch` | <img src="before/ios/admin-games_glider_preview_launch.png" width="260"> | <img src="after/ios/admin-games_glider_preview_launch.png" width="260"> |
| ios `admin-games_glider_preview_night` | <img src="before/ios/admin-games_glider_preview_night.png" width="260"> | <img src="after/ios/admin-games_glider_preview_night.png" width="260"> |
| ios `admin-games_glider_preview_world` | <img src="before/ios/admin-games_glider_preview_world.png" width="260"> | <img src="after/ios/admin-games_glider_preview_world.png" width="260"> |
| ios `admin-games_leaderboard` | <img src="before/ios/admin-games_leaderboard.png" width="260"> | <img src="after/ios/admin-games_leaderboard.png" width="260"> |
| ios `admin-games_leaderboard_game_glider` | <img src="before/ios/admin-games_leaderboard_game_glider.png" width="260"> | <img src="after/ios/admin-games_leaderboard_game_glider.png" width="260"> |
| ios `admin-games_leaderboard_game_runner` | <img src="before/ios/admin-games_leaderboard_game_runner.png" width="260"> | <img src="after/ios/admin-games_leaderboard_game_runner.png" width="260"> |
| ios `admin-games_runner` | <img src="before/ios/admin-games_runner.png" width="260"> | <img src="after/ios/admin-games_runner.png" width="260"> |
| ios `admin-games_runner_preview_double` | <img src="before/ios/admin-games_runner_preview_double.png" width="260"> | <img src="after/ios/admin-games_runner_preview_double.png" width="260"> |
| ios `admin-games_runner_preview_hang` | <img src="before/ios/admin-games_runner_preview_hang.png" width="260"> | <img src="after/ios/admin-games_runner_preview_hang.png" width="260"> |
| ios `admin-games_runner_preview_tall` | <img src="before/ios/admin-games_runner_preview_tall.png" width="260"> | <img src="after/ios/admin-games_runner_preview_tall.png" width="260"> |
| ios `admin-games_runner_preview_wide` | <img src="before/ios/admin-games_runner_preview_wide.png" width="260"> | <img src="after/ios/admin-games_runner_preview_wide.png" width="260"> |
| ios `admin-games_shooter` | <img src="before/ios/admin-games_shooter.png" width="260"> | <img src="after/ios/admin-games_shooter.png" width="260"> |
| ios `admin-grievances` | <img src="before/ios/admin-grievances.png" width="260"> | <img src="after/ios/admin-grievances.png" width="260"> |
| ios `admin-grievances_new` | <img src="before/ios/admin-grievances_new.png" width="260"> | <img src="after/ios/admin-grievances_new.png" width="260"> |
| ios `admin-grievances_tab_settings` | <img src="before/ios/admin-grievances_tab_settings.png" width="260"> | <img src="after/ios/admin-grievances_tab_settings.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-insights_tab_attendance` | <img src="before/ios/admin-insights_tab_attendance.png" width="260"> | <img src="after/ios/admin-insights_tab_attendance.png" width="260"> |
| ios `admin-insights_tab_general` | <img src="before/ios/admin-insights_tab_general.png" width="260"> | <img src="after/ios/admin-insights_tab_general.png" width="260"> |
| ios `admin-mentoring` | <img src="before/ios/admin-mentoring.png" width="260"> | <img src="after/ios/admin-mentoring.png" width="260"> |
| ios `admin-music` | <img src="before/ios/admin-music.png" width="260"> | <img src="after/ios/admin-music.png" width="260"> |
| ios `admin-notifications` | <img src="before/ios/admin-notifications.png" width="260"> | <img src="after/ios/admin-notifications.png" width="260"> |
| ios `admin-org` | <img src="before/ios/admin-org.png" width="260"> | <img src="after/ios/admin-org.png" width="260"> |
| ios `admin-profile` | <img src="before/ios/admin-profile.png" width="260"> | <img src="after/ios/admin-profile.png" width="260"> |
| ios `admin-review` | <img src="before/ios/admin-review.png" width="260"> | <img src="after/ios/admin-review.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `admin-world` | <img src="before/ios/admin-world.png" width="260"> | <img src="after/ios/admin-world.png" width="260"> |
| ios `admin-world_calendar` | <img src="before/ios/admin-world_calendar.png" width="260"> | <img src="after/ios/admin-world_calendar.png" width="260"> |
| ios `admin-world_praise` | <img src="before/ios/admin-world_praise.png" width="260"> | <img src="after/ios/admin-world_praise.png" width="260"> |
| ios `admin-world_sheet_character` | <img src="before/ios/admin-world_sheet_character.png" width="260"> | <img src="after/ios/admin-world_sheet_character.png" width="260"> |
| ios `admin-world_sheet_poke` | <img src="before/ios/admin-world_sheet_poke.png" width="260"> | <img src="after/ios/admin-world_sheet_poke.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
