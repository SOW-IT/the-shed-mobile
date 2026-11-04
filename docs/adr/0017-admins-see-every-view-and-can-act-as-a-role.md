# Admins see every view and can act as a role

2.10.21 narrowed who sees design requests to the requester and the Marketing
team, so admins lost the Marketing queue. Event requests kept main's rule: the
requester's department sees its own, and the Events department, the reviewing
teams, the Director and admins see every event (All). Daniel asked for the opposite for admins: see every
view by default, and be able to pick a department and role (Marketing staff,
say) to see exactly what that person sees.

What we weighed (2026-11-04):

- **Where the choice lives.** In the app (local storage) it would differ per
  device, and the server would still compute lists, badges and Home's
  "Waiting on you" from the admin's real roles, so the badge and the list
  could disagree. A field on `staffProfiles` would be per staff year (lost at
  the October rollover) and mixed into data that admins edit for each other.
  We chose a small `actingAs` table keyed by email, written only by
  `actingAs.set` (admins only) and read by `lensFor`, which every query that
  honours it calls with the caller's real admin status. No row means All
  views; a row for someone who is no longer an admin is ignored.
- **Who you act as.** Not a particular person: that would show another
  person's own requests and history. A persona is a role, built from the
  year's real departments: the staff or Head of a department, the Director,
  or the Budget Manager (who is always Finance staff, so the persona is too).
  The admin's identity stays theirs, so Mine is still their own.
- **Views, not actions.** Every mutation keeps checking the real roles
  (`accessTo`, `canSeeRequest`, `actsAs`), so acting as the Marketing Head
  can't approve anything. Queries that list or open things take a lens:
  `self` for non-admins (unchanged), `all` for All views and `as` for a
  persona (`shared/actingAs.ts`: `seesThrough` decides what is shown,
  `waitsThrough` what counts as waiting). Rows carry `canAct` so the app
  draws a read-only card where the admin can't really act.
- **Badges.** On All views a badge would otherwise count everyone's work.
  Badges there count only what is really waiting on the admin; acting as a
  role, they count what would be waiting on that role, so the preview matches
  what that person sees. Unread comment counts always follow the real
  threads the admin is in, since reads are personal.
- **Event requests.** All views keeps every event (admins already had All).
  A persona gets All when that role would: Events staff, a reviewing team's
  staff or Head, the Director, or an admin department; ordinary staff of
  another department see only their department's events, with no All tab.
  An event's page still opens for an admin by a link, since their real
  access allows it, but read-only unless their real role gives them the
  action: an admin on the event's requester side (they asked for it, or are
  in or head its department) can still edit or cancel it, and an admin who
  really approves a form can decide it. An admin who is also a campus leader
  gets it read-only either way, since event actions are for staff.
- **Grievances.** They are confidential to the grievance team, and the
  glossary already says admins outside it can't see them. All views and
  every persona leave them out.
- **Admin tools.** `directory.me` reports the persona's flags, so while
  acting as Marketing staff the menu has no Admin or Announcements, like a
  Marketing staff member's. Mentoring stays for an admin who mentors someone
  themselves: their mentees are theirs, like Mine. The server still lets the
  admin use the tools; the chip at the top and "Acting as" in the menu reset
  to All views in one tap.
- **Campus leaders.** An admin who also holds a campus role is not treated as
  a campus leader on All views or while acting as a role, so the staff views
  (reimbursements, event requests, Waiting on you) stay open; creating an
  event still checks the real roles, and `directory.me` reports
  `canRequestEvents` from them so the New Event Request button stays hidden.

Trade-offs: the server reads the admin's status and the `actingAs` row in
each honouring query (a few indexed reads); a persona's Waiting on you can
show work the admin can't finish; and reimbursement receipts (bank details)
are visible to admins on All views, as they are to Finance.
