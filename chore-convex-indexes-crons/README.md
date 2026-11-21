# verify: full

- because core: convex/comments.ts
- because core: convex/crons.ts
- because core: convex/schema.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 41s |  |
| typecheck | ✔ pass | 12s |  |
| unit tests with coverage | ✔ pass | 16s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 18s | before functions on :3270 |
| before: web | ✔ pass | 467s | 140 screens, 0 broken, still moving: staff-root, staff-all, admin-review, admin-all. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 201s | 35 screenshots; still moving after 10 frames: admin-review, admin-all |
| after: local backend | ✔ pass | 15s | after functions on :3270 |
| after: web | ✔ pass | 480s | 140 screens, 0 broken, still moving: staff-root, staff-all, admin-review, admin-all. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 191s | 35 screenshots; still moving after 10 frames: admin-review, admin-all |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-admin` | <img src="before/web/admin-admin.png" width="260"> | <img src="after/web/admin-admin.png" width="260"> |
| web `admin-admin_tab_system` | <img src="before/web/admin-admin_tab_system.png" width="260"> | <img src="after/web/admin-admin_tab_system.png" width="260"> |
| web `admin-admin_tab_teams` | <img src="before/web/admin-admin_tab_teams.png" width="260"> | <img src="after/web/admin-admin_tab_teams.png" width="260"> |
| web `admin-all` | <img src="before/web/admin-all.png" width="260"> | <img src="after/web/admin-all.png" width="260"> |
| web `admin-announcements` | <img src="before/web/admin-announcements.png" width="260"> | <img src="after/web/admin-announcements.png" width="260"> |
| web `admin-attendance` | <img src="before/web/admin-attendance.png" width="260"> | <img src="after/web/admin-attendance.png" width="260"> |
| web `admin-attendance_event_eventId` | <img src="before/web/admin-attendance_event_eventId.png" width="260"> | <img src="after/web/admin-attendance_event_eventId.png" width="260"> |
| web `admin-attendance_member_member_3A_memberId` | <img src="before/web/admin-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/admin-attendance_member_member_3A_memberId.png" width="260"> |
| web `admin-attendance_merges` | <img src="before/web/admin-attendance_merges.png" width="260"> | <img src="after/web/admin-attendance_merges.png" width="260"> |
| web `admin-calendar` | <img src="before/web/admin-calendar.png" width="260"> | <img src="after/web/admin-calendar.png" width="260"> |
| web `admin-calendar_history` | <img src="before/web/admin-calendar_history.png" width="260"> | <img src="after/web/admin-calendar_history.png" width="260"> |
| web `admin-calendar_view_week` | <img src="before/web/admin-calendar_view_week.png" width="260"> | <img src="after/web/admin-calendar_view_week.png" width="260"> |
| web `admin-checkin_checkInToken` | <img src="before/web/admin-checkin_checkInToken.png" width="260"> | <img src="after/web/admin-checkin_checkInToken.png" width="260"> |
| web `admin-checkin_not_a_real_link` | <img src="before/web/admin-checkin_not_a_real_link.png" width="260"> | <img src="after/web/admin-checkin_not_a_real_link.png" width="260"> |
| web `admin-churches` | <img src="before/web/admin-churches.png" width="260"> | <img src="after/web/admin-churches.png" width="260"> |
| web `admin-design_requests` | <img src="before/web/admin-design_requests.png" width="260"> | <img src="after/web/admin-design_requests.png" width="260"> |
| web `admin-design_requests_new` | <img src="before/web/admin-design_requests_new.png" width="260"> | <img src="after/web/admin-design_requests_new.png" width="260"> |
| web `admin-edit_home` | <img src="before/web/admin-edit_home.png" width="260"> | <img src="after/web/admin-edit_home.png" width="260"> |
| web `admin-event_requests` | <img src="before/web/admin-event_requests.png" width="260"> | <img src="after/web/admin-event_requests.png" width="260"> |
| web `admin-event_requests_new` | <img src="before/web/admin-event_requests_new.png" width="260"> | <img src="after/web/admin-event_requests_new.png" width="260"> |
| web `admin-finance_settings` | <img src="before/web/admin-finance_settings.png" width="260"> | <img src="after/web/admin-finance_settings.png" width="260"> |
| web `admin-grievances` | <img src="before/web/admin-grievances.png" width="260"> | <img src="after/web/admin-grievances.png" width="260"> |
| web `admin-grievances_new` | <img src="before/web/admin-grievances_new.png" width="260"> | <img src="after/web/admin-grievances_new.png" width="260"> |
| web `admin-grievances_tab_settings` | <img src="before/web/admin-grievances_tab_settings.png" width="260"> | <img src="after/web/admin-grievances_tab_settings.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-insights_tab_attendance` | <img src="before/web/admin-insights_tab_attendance.png" width="260"> | <img src="after/web/admin-insights_tab_attendance.png" width="260"> |
| web `admin-insights_tab_general` | <img src="before/web/admin-insights_tab_general.png" width="260"> | <img src="after/web/admin-insights_tab_general.png" width="260"> |
| web `admin-mentoring` | <img src="before/web/admin-mentoring.png" width="260"> | <img src="after/web/admin-mentoring.png" width="260"> |
| web `admin-music` | <img src="before/web/admin-music.png" width="260"> | <img src="after/web/admin-music.png" width="260"> |
| web `admin-no_such_page` | <img src="before/web/admin-no_such_page.png" width="260"> | <img src="after/web/admin-no_such_page.png" width="260"> |
| web `admin-notifications` | <img src="before/web/admin-notifications.png" width="260"> | <img src="after/web/admin-notifications.png" width="260"> |
| web `admin-org` | <img src="before/web/admin-org.png" width="260"> | <img src="after/web/admin-org.png" width="260"> |
| web `admin-profile` | <img src="before/web/admin-profile.png" width="260"> | <img src="after/web/admin-profile.png" width="260"> |
| web `admin-review` | <img src="before/web/admin-review.png" width="260"> | <img src="after/web/admin-review.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `leader-admin` | <img src="before/web/leader-admin.png" width="260"> | <img src="after/web/leader-admin.png" width="260"> |
| web `leader-admin_tab_system` | <img src="before/web/leader-admin_tab_system.png" width="260"> | <img src="after/web/leader-admin_tab_system.png" width="260"> |
| web `leader-admin_tab_teams` | <img src="before/web/leader-admin_tab_teams.png" width="260"> | <img src="after/web/leader-admin_tab_teams.png" width="260"> |
| web `leader-all` | <img src="before/web/leader-all.png" width="260"> | <img src="after/web/leader-all.png" width="260"> |
| web `leader-announcements` | <img src="before/web/leader-announcements.png" width="260"> | <img src="after/web/leader-announcements.png" width="260"> |
| web `leader-attendance` | <img src="before/web/leader-attendance.png" width="260"> | <img src="after/web/leader-attendance.png" width="260"> |
| web `leader-attendance_event_eventId` | <img src="before/web/leader-attendance_event_eventId.png" width="260"> | <img src="after/web/leader-attendance_event_eventId.png" width="260"> |
| web `leader-attendance_member_member_3A_memberId` | <img src="before/web/leader-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/leader-attendance_member_member_3A_memberId.png" width="260"> |
| web `leader-attendance_merges` | <img src="before/web/leader-attendance_merges.png" width="260"> | <img src="after/web/leader-attendance_merges.png" width="260"> |
| web `leader-calendar` | <img src="before/web/leader-calendar.png" width="260"> | <img src="after/web/leader-calendar.png" width="260"> |
| web `leader-calendar_history` | <img src="before/web/leader-calendar_history.png" width="260"> | <img src="after/web/leader-calendar_history.png" width="260"> |
| web `leader-calendar_view_week` | <img src="before/web/leader-calendar_view_week.png" width="260"> | <img src="after/web/leader-calendar_view_week.png" width="260"> |
| web `leader-checkin_checkInToken` | <img src="before/web/leader-checkin_checkInToken.png" width="260"> | <img src="after/web/leader-checkin_checkInToken.png" width="260"> |
| web `leader-checkin_not_a_real_link` | <img src="before/web/leader-checkin_not_a_real_link.png" width="260"> | <img src="after/web/leader-checkin_not_a_real_link.png" width="260"> |
| web `leader-churches` | <img src="before/web/leader-churches.png" width="260"> | <img src="after/web/leader-churches.png" width="260"> |
| web `leader-design_requests` | <img src="before/web/leader-design_requests.png" width="260"> | <img src="after/web/leader-design_requests.png" width="260"> |
| web `leader-design_requests_new` | <img src="before/web/leader-design_requests_new.png" width="260"> | <img src="after/web/leader-design_requests_new.png" width="260"> |
| web `leader-edit_home` | <img src="before/web/leader-edit_home.png" width="260"> | <img src="after/web/leader-edit_home.png" width="260"> |
| web `leader-event_requests` | <img src="before/web/leader-event_requests.png" width="260"> | <img src="after/web/leader-event_requests.png" width="260"> |
| web `leader-event_requests_new` | <img src="before/web/leader-event_requests_new.png" width="260"> | <img src="after/web/leader-event_requests_new.png" width="260"> |
| web `leader-finance_settings` | <img src="before/web/leader-finance_settings.png" width="260"> | <img src="after/web/leader-finance_settings.png" width="260"> |
| web `leader-grievances` | <img src="before/web/leader-grievances.png" width="260"> | <img src="after/web/leader-grievances.png" width="260"> |
| web `leader-grievances_new` | <img src="before/web/leader-grievances_new.png" width="260"> | <img src="after/web/leader-grievances_new.png" width="260"> |
| web `leader-grievances_tab_settings` | <img src="before/web/leader-grievances_tab_settings.png" width="260"> | <img src="after/web/leader-grievances_tab_settings.png" width="260"> |
| web `leader-home` | <img src="before/web/leader-home.png" width="260"> | <img src="after/web/leader-home.png" width="260"> |
| web `leader-insights_tab_attendance` | <img src="before/web/leader-insights_tab_attendance.png" width="260"> | <img src="after/web/leader-insights_tab_attendance.png" width="260"> |
| web `leader-insights_tab_general` | <img src="before/web/leader-insights_tab_general.png" width="260"> | <img src="after/web/leader-insights_tab_general.png" width="260"> |
| web `leader-mentoring` | <img src="before/web/leader-mentoring.png" width="260"> | <img src="after/web/leader-mentoring.png" width="260"> |
| web `leader-music` | <img src="before/web/leader-music.png" width="260"> | <img src="after/web/leader-music.png" width="260"> |
| web `leader-no_such_page` | <img src="before/web/leader-no_such_page.png" width="260"> | <img src="after/web/leader-no_such_page.png" width="260"> |
| web `leader-notifications` | <img src="before/web/leader-notifications.png" width="260"> | <img src="after/web/leader-notifications.png" width="260"> |
| web `leader-org` | <img src="before/web/leader-org.png" width="260"> | <img src="after/web/leader-org.png" width="260"> |
| web `leader-profile` | <img src="before/web/leader-profile.png" width="260"> | <img src="after/web/leader-profile.png" width="260"> |
| web `leader-review` | <img src="before/web/leader-review.png" width="260"> | <img src="after/web/leader-review.png" width="260"> |
| web `leader-root` | <img src="before/web/leader-root.png" width="260"> | <img src="after/web/leader-root.png" width="260"> |
| web `out-admin` | <img src="before/web/out-admin.png" width="260"> | <img src="after/web/out-admin.png" width="260"> |
| web `out-admin_tab_system` | <img src="before/web/out-admin_tab_system.png" width="260"> | <img src="after/web/out-admin_tab_system.png" width="260"> |
| web `out-admin_tab_teams` | <img src="before/web/out-admin_tab_teams.png" width="260"> | <img src="after/web/out-admin_tab_teams.png" width="260"> |
| web `out-all` | <img src="before/web/out-all.png" width="260"> | <img src="after/web/out-all.png" width="260"> |
| web `out-announcements` | <img src="before/web/out-announcements.png" width="260"> | <img src="after/web/out-announcements.png" width="260"> |
| web `out-attendance` | <img src="before/web/out-attendance.png" width="260"> | <img src="after/web/out-attendance.png" width="260"> |
| web `out-attendance_event_eventId` | <img src="before/web/out-attendance_event_eventId.png" width="260"> | <img src="after/web/out-attendance_event_eventId.png" width="260"> |
| web `out-attendance_member_member_3A_memberId` | <img src="before/web/out-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/out-attendance_member_member_3A_memberId.png" width="260"> |
| web `out-attendance_merges` | <img src="before/web/out-attendance_merges.png" width="260"> | <img src="after/web/out-attendance_merges.png" width="260"> |
| web `out-calendar` | <img src="before/web/out-calendar.png" width="260"> | <img src="after/web/out-calendar.png" width="260"> |
| web `out-calendar_history` | <img src="before/web/out-calendar_history.png" width="260"> | <img src="after/web/out-calendar_history.png" width="260"> |
| web `out-calendar_view_week` | <img src="before/web/out-calendar_view_week.png" width="260"> | <img src="after/web/out-calendar_view_week.png" width="260"> |
| web `out-checkin_checkInToken` | <img src="before/web/out-checkin_checkInToken.png" width="260"> | <img src="after/web/out-checkin_checkInToken.png" width="260"> |
| web `out-checkin_not_a_real_link` | <img src="before/web/out-checkin_not_a_real_link.png" width="260"> | <img src="after/web/out-checkin_not_a_real_link.png" width="260"> |
| web `out-churches` | <img src="before/web/out-churches.png" width="260"> | <img src="after/web/out-churches.png" width="260"> |
| web `out-design_requests` | <img src="before/web/out-design_requests.png" width="260"> | <img src="after/web/out-design_requests.png" width="260"> |
| web `out-design_requests_new` | <img src="before/web/out-design_requests_new.png" width="260"> | <img src="after/web/out-design_requests_new.png" width="260"> |
| web `out-edit_home` | <img src="before/web/out-edit_home.png" width="260"> | <img src="after/web/out-edit_home.png" width="260"> |
| web `out-event_requests` | <img src="before/web/out-event_requests.png" width="260"> | <img src="after/web/out-event_requests.png" width="260"> |
| web `out-event_requests_new` | <img src="before/web/out-event_requests_new.png" width="260"> | <img src="after/web/out-event_requests_new.png" width="260"> |
| web `out-finance_settings` | <img src="before/web/out-finance_settings.png" width="260"> | <img src="after/web/out-finance_settings.png" width="260"> |
| web `out-grievances` | <img src="before/web/out-grievances.png" width="260"> | <img src="after/web/out-grievances.png" width="260"> |
| web `out-grievances_new` | <img src="before/web/out-grievances_new.png" width="260"> | <img src="after/web/out-grievances_new.png" width="260"> |
| web `out-grievances_tab_settings` | <img src="before/web/out-grievances_tab_settings.png" width="260"> | <img src="after/web/out-grievances_tab_settings.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-insights_tab_attendance` | <img src="before/web/out-insights_tab_attendance.png" width="260"> | <img src="after/web/out-insights_tab_attendance.png" width="260"> |
| web `out-insights_tab_general` | <img src="before/web/out-insights_tab_general.png" width="260"> | <img src="after/web/out-insights_tab_general.png" width="260"> |
| web `out-mentoring` | <img src="before/web/out-mentoring.png" width="260"> | <img src="after/web/out-mentoring.png" width="260"> |
| web `out-music` | <img src="before/web/out-music.png" width="260"> | <img src="after/web/out-music.png" width="260"> |
| web `out-no_such_page` | <img src="before/web/out-no_such_page.png" width="260"> | <img src="after/web/out-no_such_page.png" width="260"> |
| web `out-notifications` | <img src="before/web/out-notifications.png" width="260"> | <img src="after/web/out-notifications.png" width="260"> |
| web `out-org` | <img src="before/web/out-org.png" width="260"> | <img src="after/web/out-org.png" width="260"> |
| web `out-profile` | <img src="before/web/out-profile.png" width="260"> | <img src="after/web/out-profile.png" width="260"> |
| web `out-review` | <img src="before/web/out-review.png" width="260"> | <img src="after/web/out-review.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| web `staff-admin` | <img src="before/web/staff-admin.png" width="260"> | <img src="after/web/staff-admin.png" width="260"> |
| web `staff-admin_tab_system` | <img src="before/web/staff-admin_tab_system.png" width="260"> | <img src="after/web/staff-admin_tab_system.png" width="260"> |
| web `staff-admin_tab_teams` | <img src="before/web/staff-admin_tab_teams.png" width="260"> | <img src="after/web/staff-admin_tab_teams.png" width="260"> |
| web `staff-all` | <img src="before/web/staff-all.png" width="260"> | <img src="after/web/staff-all.png" width="260"> |
| web `staff-announcements` | <img src="before/web/staff-announcements.png" width="260"> | <img src="after/web/staff-announcements.png" width="260"> |
| web `staff-attendance` | <img src="before/web/staff-attendance.png" width="260"> | <img src="after/web/staff-attendance.png" width="260"> |
| web `staff-attendance_event_eventId` | <img src="before/web/staff-attendance_event_eventId.png" width="260"> | <img src="after/web/staff-attendance_event_eventId.png" width="260"> |
| web `staff-attendance_member_member_3A_memberId` | <img src="before/web/staff-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/staff-attendance_member_member_3A_memberId.png" width="260"> |
| web `staff-attendance_merges` | <img src="before/web/staff-attendance_merges.png" width="260"> | <img src="after/web/staff-attendance_merges.png" width="260"> |
| web `staff-calendar` | <img src="before/web/staff-calendar.png" width="260"> | <img src="after/web/staff-calendar.png" width="260"> |
| web `staff-calendar_history` | <img src="before/web/staff-calendar_history.png" width="260"> | <img src="after/web/staff-calendar_history.png" width="260"> |
| web `staff-calendar_view_week` | <img src="before/web/staff-calendar_view_week.png" width="260"> | <img src="after/web/staff-calendar_view_week.png" width="260"> |
| web `staff-checkin_checkInToken` | <img src="before/web/staff-checkin_checkInToken.png" width="260"> | <img src="after/web/staff-checkin_checkInToken.png" width="260"> |
| web `staff-checkin_not_a_real_link` | <img src="before/web/staff-checkin_not_a_real_link.png" width="260"> | <img src="after/web/staff-checkin_not_a_real_link.png" width="260"> |
| web `staff-churches` | <img src="before/web/staff-churches.png" width="260"> | <img src="after/web/staff-churches.png" width="260"> |
| web `staff-design_requests` | <img src="before/web/staff-design_requests.png" width="260"> | <img src="after/web/staff-design_requests.png" width="260"> |
| web `staff-design_requests_new` | <img src="before/web/staff-design_requests_new.png" width="260"> | <img src="after/web/staff-design_requests_new.png" width="260"> |
| web `staff-edit_home` | <img src="before/web/staff-edit_home.png" width="260"> | <img src="after/web/staff-edit_home.png" width="260"> |
| web `staff-event_requests` | <img src="before/web/staff-event_requests.png" width="260"> | <img src="after/web/staff-event_requests.png" width="260"> |
| web `staff-event_requests_new` | <img src="before/web/staff-event_requests_new.png" width="260"> | <img src="after/web/staff-event_requests_new.png" width="260"> |
| web `staff-finance_settings` | <img src="before/web/staff-finance_settings.png" width="260"> | <img src="after/web/staff-finance_settings.png" width="260"> |
| web `staff-grievances` | <img src="before/web/staff-grievances.png" width="260"> | <img src="after/web/staff-grievances.png" width="260"> |
| web `staff-grievances_new` | <img src="before/web/staff-grievances_new.png" width="260"> | <img src="after/web/staff-grievances_new.png" width="260"> |
| web `staff-grievances_tab_settings` | <img src="before/web/staff-grievances_tab_settings.png" width="260"> | <img src="after/web/staff-grievances_tab_settings.png" width="260"> |
| web `staff-home` | <img src="before/web/staff-home.png" width="260"> | <img src="after/web/staff-home.png" width="260"> |
| web `staff-insights_tab_attendance` | <img src="before/web/staff-insights_tab_attendance.png" width="260"> | <img src="after/web/staff-insights_tab_attendance.png" width="260"> |
| web `staff-insights_tab_general` | <img src="before/web/staff-insights_tab_general.png" width="260"> | <img src="after/web/staff-insights_tab_general.png" width="260"> |
| web `staff-mentoring` | <img src="before/web/staff-mentoring.png" width="260"> | <img src="after/web/staff-mentoring.png" width="260"> |
| web `staff-music` | <img src="before/web/staff-music.png" width="260"> | <img src="after/web/staff-music.png" width="260"> |
| web `staff-no_such_page` | <img src="before/web/staff-no_such_page.png" width="260"> | <img src="after/web/staff-no_such_page.png" width="260"> |
| web `staff-notifications` | <img src="before/web/staff-notifications.png" width="260"> | <img src="after/web/staff-notifications.png" width="260"> |
| web `staff-org` | <img src="before/web/staff-org.png" width="260"> | <img src="after/web/staff-org.png" width="260"> |
| web `staff-profile` | <img src="before/web/staff-profile.png" width="260"> | <img src="after/web/staff-profile.png" width="260"> |
| web `staff-review` | <img src="before/web/staff-review.png" width="260"> | <img src="after/web/staff-review.png" width="260"> |
| web `staff-root` | <img src="before/web/staff-root.png" width="260"> | <img src="after/web/staff-root.png" width="260"> |
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
| ios `admin-edit_home` | <img src="before/ios/admin-edit_home.png" width="260"> | <img src="after/ios/admin-edit_home.png" width="260"> |
| ios `admin-event_requests` | <img src="before/ios/admin-event_requests.png" width="260"> | <img src="after/ios/admin-event_requests.png" width="260"> |
| ios `admin-event_requests_new` | <img src="before/ios/admin-event_requests_new.png" width="260"> | <img src="after/ios/admin-event_requests_new.png" width="260"> |
| ios `admin-finance_settings` | <img src="before/ios/admin-finance_settings.png" width="260"> | <img src="after/ios/admin-finance_settings.png" width="260"> |
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
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
