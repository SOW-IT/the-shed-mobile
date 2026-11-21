# verify: scoped

- because event-requests: src/app/event-requests/[id]/[form].tsx
- because notifications: src/app/notifications.tsx
- because attendance, insights: src/components/attendance/InsightsBlocks.tsx
- because attendance: src/components/attendance/MembersTab.tsx
- because reimbursements: src/components/finance/FinanceSettings.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 39s |  |
| typecheck | ✔ pass | 11s |  |
| related unit tests | ✔ pass | 11s | 1368 passed (1368) |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 15s | before functions on :3270 |
| before: web | ✔ pass | 117s | 30 screens, 0 broken. |
| before: iOS reset | ✔ pass | 1s |  |
| before: iOS | ✔ pass | 112s | 17 screenshots |
| after: local backend | ✔ pass | 15s | after functions on :3270 |
| after: web | ✔ pass | 125s | 30 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 104s | 17 screenshots |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-all` | <img src="before/web/admin-all.png" width="260"> | <img src="after/web/admin-all.png" width="260"> |
| web `admin-attendance` | <img src="before/web/admin-attendance.png" width="260"> | <img src="after/web/admin-attendance.png" width="260"> |
| web `admin-attendance_event_eventId` | <img src="before/web/admin-attendance_event_eventId.png" width="260"> | <img src="after/web/admin-attendance_event_eventId.png" width="260"> |
| web `admin-attendance_member_member_3A_memberId` | <img src="before/web/admin-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/admin-attendance_member_member_3A_memberId.png" width="260"> |
| web `admin-attendance_merges` | <img src="before/web/admin-attendance_merges.png" width="260"> | <img src="after/web/admin-attendance_merges.png" width="260"> |
| web `admin-checkin_checkInToken` | <img src="before/web/admin-checkin_checkInToken.png" width="260"> | <img src="after/web/admin-checkin_checkInToken.png" width="260"> |
| web `admin-event_requests` | <img src="before/web/admin-event_requests.png" width="260"> | <img src="after/web/admin-event_requests.png" width="260"> |
| web `admin-event_requests_new` | <img src="before/web/admin-event_requests_new.png" width="260"> | <img src="after/web/admin-event_requests_new.png" width="260"> |
| web `admin-finance_settings` | <img src="before/web/admin-finance_settings.png" width="260"> | <img src="after/web/admin-finance_settings.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-insights_tab_attendance` | <img src="before/web/admin-insights_tab_attendance.png" width="260"> | <img src="after/web/admin-insights_tab_attendance.png" width="260"> |
| web `admin-insights_tab_general` | <img src="before/web/admin-insights_tab_general.png" width="260"> | <img src="after/web/admin-insights_tab_general.png" width="260"> |
| web `admin-notifications` | <img src="before/web/admin-notifications.png" width="260"> | <img src="after/web/admin-notifications.png" width="260"> |
| web `admin-review` | <img src="before/web/admin-review.png" width="260"> | <img src="after/web/admin-review.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-all` | <img src="before/web/out-all.png" width="260"> | <img src="after/web/out-all.png" width="260"> |
| web `out-attendance` | <img src="before/web/out-attendance.png" width="260"> | <img src="after/web/out-attendance.png" width="260"> |
| web `out-attendance_event_eventId` | <img src="before/web/out-attendance_event_eventId.png" width="260"> | <img src="after/web/out-attendance_event_eventId.png" width="260"> |
| web `out-attendance_member_member_3A_memberId` | <img src="before/web/out-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/out-attendance_member_member_3A_memberId.png" width="260"> |
| web `out-attendance_merges` | <img src="before/web/out-attendance_merges.png" width="260"> | <img src="after/web/out-attendance_merges.png" width="260"> |
| web `out-checkin_checkInToken` | <img src="before/web/out-checkin_checkInToken.png" width="260"> | <img src="after/web/out-checkin_checkInToken.png" width="260"> |
| web `out-event_requests` | <img src="before/web/out-event_requests.png" width="260"> | <img src="after/web/out-event_requests.png" width="260"> |
| web `out-event_requests_new` | <img src="before/web/out-event_requests_new.png" width="260"> | <img src="after/web/out-event_requests_new.png" width="260"> |
| web `out-finance_settings` | <img src="before/web/out-finance_settings.png" width="260"> | <img src="after/web/out-finance_settings.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-insights_tab_attendance` | <img src="before/web/out-insights_tab_attendance.png" width="260"> | <img src="after/web/out-insights_tab_attendance.png" width="260"> |
| web `out-insights_tab_general` | <img src="before/web/out-insights_tab_general.png" width="260"> | <img src="after/web/out-insights_tab_general.png" width="260"> |
| web `out-notifications` | <img src="before/web/out-notifications.png" width="260"> | <img src="after/web/out-notifications.png" width="260"> |
| web `out-review` | <img src="before/web/out-review.png" width="260"> | <img src="after/web/out-review.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-all` | <img src="before/ios/admin-all.png" width="260"> | <img src="after/ios/admin-all.png" width="260"> |
| ios `admin-attendance` | <img src="before/ios/admin-attendance.png" width="260"> | <img src="after/ios/admin-attendance.png" width="260"> |
| ios `admin-attendance_event_eventId` | <img src="before/ios/admin-attendance_event_eventId.png" width="260"> | <img src="after/ios/admin-attendance_event_eventId.png" width="260"> |
| ios `admin-attendance_member_member_3A_memberId` | <img src="before/ios/admin-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/ios/admin-attendance_member_member_3A_memberId.png" width="260"> |
| ios `admin-attendance_merges` | <img src="before/ios/admin-attendance_merges.png" width="260"> | <img src="after/ios/admin-attendance_merges.png" width="260"> |
| ios `admin-checkin_checkInToken` | <img src="before/ios/admin-checkin_checkInToken.png" width="260"> | <img src="after/ios/admin-checkin_checkInToken.png" width="260"> |
| ios `admin-event_requests` | <img src="before/ios/admin-event_requests.png" width="260"> | <img src="after/ios/admin-event_requests.png" width="260"> |
| ios `admin-event_requests_new` | <img src="before/ios/admin-event_requests_new.png" width="260"> | <img src="after/ios/admin-event_requests_new.png" width="260"> |
| ios `admin-finance_settings` | <img src="before/ios/admin-finance_settings.png" width="260"> | <img src="after/ios/admin-finance_settings.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-insights_tab_attendance` | <img src="before/ios/admin-insights_tab_attendance.png" width="260"> | <img src="after/ios/admin-insights_tab_attendance.png" width="260"> |
| ios `admin-insights_tab_general` | <img src="before/ios/admin-insights_tab_general.png" width="260"> | <img src="after/ios/admin-insights_tab_general.png" width="260"> |
| ios `admin-notifications` | <img src="before/ios/admin-notifications.png" width="260"> | <img src="after/ios/admin-notifications.png" width="260"> |
| ios `admin-review` | <img src="before/ios/admin-review.png" width="260"> | <img src="after/ios/admin-review.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
