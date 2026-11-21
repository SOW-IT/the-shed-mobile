# verify: full

- because core: convex/model.ts
- because core: shared/datetime.ts
- because core: shared/numbers.ts
- because core: src/components/AppUpdatePrompt.tsx
- because core: src/components/CommentsSheet.tsx
- because core: src/components/DateInputs.tsx
- because core: src/components/DateInputs.web.tsx
- because core: src/components/FilterChips.tsx
- because core: src/components/HistoryTimeline.tsx
- because core: src/components/nav/NavMenu.tsx
- because core: src/components/nav/TopBar.tsx
- because core: src/components/ui/buttons.tsx
- because core: src/components/ui/feedback.tsx
- because core: src/components/ui/forms.tsx
- because core: src/components/ui/primitives.tsx
- because core: src/components/ui/screen.tsx
- because core: src/components/ui/styles.ts
- because core: src/hooks/useReportAppVersion.ts
- because core: src/hooks/useStaffWaitingBadge.ts
- because core: src/theme.ts

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 3s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 40s |  |
| unused code (knip) | ✔ pass | 4s |  |
| typecheck | ✔ pass | 12s |  |
| unit tests with coverage | ✔ pass | 15s |  |
| before: local backend | ✔ pass | 14s | before functions on :3270 |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 184s | 35 screenshots |
| after: local backend | ✔ pass | 14s | after functions on :3270 |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 179s | 35 screenshots |

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
