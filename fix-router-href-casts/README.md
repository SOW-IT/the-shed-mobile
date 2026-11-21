# verify: scoped

- because notifications: src/app/notifications.tsx
- because attendance, insights: src/components/attendance/InsightsBlocks.tsx

| Step | Result | Time | Detail |
| --- | --- | --- | --- |
| base tree | ✔ pass | 0s |  |
| native fingerprint | ✔ pass | 4s | unchanged on iOS and Android: over-the-air updates reach current builds |
| lint | ✔ pass | 66s |  |
| typecheck | ✔ pass | 18s |  |
| related unit tests | ✔ pass | 2s |  |
| Playwright Chromium | ✔ pass | 1s |  |
| before: local backend | ✔ pass | 15s | before functions on :3270 |
| before: web | ✔ pass | 139s | 20 screens, 0 broken. |
| before: iOS reset | ✔ pass | 2s |  |
| before: iOS | ✔ pass | 97s | 12 screenshots |
| after: local backend | ✔ pass | 16s | after functions on :3270 |
| after: web | ✔ pass | 104s | 20 screens, 0 broken. |
| after: iOS reset | ✔ pass | 1s |  |
| after: iOS | ✔ pass | 93s | 12 screenshots |

## Screenshots

| Screen | Before | After |
| --- | --- | --- |
| web `admin-attendance` | <img src="before/web/admin-attendance.png" width="260"> | <img src="after/web/admin-attendance.png" width="260"> |
| web `admin-attendance_event_eventId` | <img src="before/web/admin-attendance_event_eventId.png" width="260"> | <img src="after/web/admin-attendance_event_eventId.png" width="260"> |
| web `admin-attendance_member_member_3A_memberId` | <img src="before/web/admin-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/admin-attendance_member_member_3A_memberId.png" width="260"> |
| web `admin-attendance_merges` | <img src="before/web/admin-attendance_merges.png" width="260"> | <img src="after/web/admin-attendance_merges.png" width="260"> |
| web `admin-checkin_checkInToken` | <img src="before/web/admin-checkin_checkInToken.png" width="260"> | <img src="after/web/admin-checkin_checkInToken.png" width="260"> |
| web `admin-home` | <img src="before/web/admin-home.png" width="260"> | <img src="after/web/admin-home.png" width="260"> |
| web `admin-insights_tab_attendance` | <img src="before/web/admin-insights_tab_attendance.png" width="260"> | <img src="after/web/admin-insights_tab_attendance.png" width="260"> |
| web `admin-insights_tab_general` | <img src="before/web/admin-insights_tab_general.png" width="260"> | <img src="after/web/admin-insights_tab_general.png" width="260"> |
| web `admin-notifications` | <img src="before/web/admin-notifications.png" width="260"> | <img src="after/web/admin-notifications.png" width="260"> |
| web `admin-root` | <img src="before/web/admin-root.png" width="260"> | <img src="after/web/admin-root.png" width="260"> |
| web `out-attendance` | <img src="before/web/out-attendance.png" width="260"> | <img src="after/web/out-attendance.png" width="260"> |
| web `out-attendance_event_eventId` | <img src="before/web/out-attendance_event_eventId.png" width="260"> | <img src="after/web/out-attendance_event_eventId.png" width="260"> |
| web `out-attendance_member_member_3A_memberId` | <img src="before/web/out-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/web/out-attendance_member_member_3A_memberId.png" width="260"> |
| web `out-attendance_merges` | <img src="before/web/out-attendance_merges.png" width="260"> | <img src="after/web/out-attendance_merges.png" width="260"> |
| web `out-checkin_checkInToken` | <img src="before/web/out-checkin_checkInToken.png" width="260"> | <img src="after/web/out-checkin_checkInToken.png" width="260"> |
| web `out-home` | <img src="before/web/out-home.png" width="260"> | <img src="after/web/out-home.png" width="260"> |
| web `out-insights_tab_attendance` | <img src="before/web/out-insights_tab_attendance.png" width="260"> | <img src="after/web/out-insights_tab_attendance.png" width="260"> |
| web `out-insights_tab_general` | <img src="before/web/out-insights_tab_general.png" width="260"> | <img src="after/web/out-insights_tab_general.png" width="260"> |
| web `out-notifications` | <img src="before/web/out-notifications.png" width="260"> | <img src="after/web/out-notifications.png" width="260"> |
| web `out-root` | <img src="before/web/out-root.png" width="260"> | <img src="after/web/out-root.png" width="260"> |
| ios `admin-attendance` | <img src="before/ios/admin-attendance.png" width="260"> | <img src="after/ios/admin-attendance.png" width="260"> |
| ios `admin-attendance_event_eventId` | <img src="before/ios/admin-attendance_event_eventId.png" width="260"> | <img src="after/ios/admin-attendance_event_eventId.png" width="260"> |
| ios `admin-attendance_member_member_3A_memberId` | <img src="before/ios/admin-attendance_member_member_3A_memberId.png" width="260"> | <img src="after/ios/admin-attendance_member_member_3A_memberId.png" width="260"> |
| ios `admin-attendance_merges` | <img src="before/ios/admin-attendance_merges.png" width="260"> | <img src="after/ios/admin-attendance_merges.png" width="260"> |
| ios `admin-checkin_checkInToken` | <img src="before/ios/admin-checkin_checkInToken.png" width="260"> | <img src="after/ios/admin-checkin_checkInToken.png" width="260"> |
| ios `admin-home` | <img src="before/ios/admin-home.png" width="260"> | <img src="after/ios/admin-home.png" width="260"> |
| ios `admin-insights_tab_attendance` | <img src="before/ios/admin-insights_tab_attendance.png" width="260"> | <img src="after/ios/admin-insights_tab_attendance.png" width="260"> |
| ios `admin-insights_tab_general` | <img src="before/ios/admin-insights_tab_general.png" width="260"> | <img src="after/ios/admin-insights_tab_general.png" width="260"> |
| ios `admin-notifications` | <img src="before/ios/admin-notifications.png" width="260"> | <img src="after/ios/admin-notifications.png" width="260"> |
| ios `admin-root` | <img src="before/ios/admin-root.png" width="260"> | <img src="after/ios/admin-root.png" width="260"> |
| ios `out-home` | <img src="before/ios/out-home.png" width="260"> | <img src="after/ios/out-home.png" width="260"> |
| ios `out-root` | <img src="before/ios/out-root.png" width="260"> | <img src="after/ios/out-root.png" width="260"> |
