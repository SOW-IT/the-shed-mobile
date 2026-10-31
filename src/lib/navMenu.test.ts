import { describe, expect, test } from "vitest";
import {
  activeNavKey,
  badgeText,
  drawerItems,
  NAV_GROUP_LABELS,
  NAV_HREFS,
  NAV_LABELS,
  navEntries,
  navViewer,
  roleLine,
  showsReimbursements,
  sidebarItems,
} from "./navMenu";

const staffProfile = { roles: ["Staff"], assignments: [] };

const signedOut = navViewer(false, undefined);
const guest = navViewer(true, { profile: null });
const staff = navViewer(true, { profile: staffProfile });
const campusLeader = navViewer(true, { profile: staffProfile, isCampusLeader: true });
const admin = navViewer(true, { profile: staffProfile, isAdmin: true });
const financeHead = navViewer(true, { profile: staffProfile, isFinanceHead: true });
const mentor = navViewer(true, { profile: staffProfile, isMentor: true });
const campusLeaderAdmin = navViewer(true, {
  profile: staffProfile,
  isCampusLeader: true,
  isAdmin: true,
});

describe("navViewer", () => {
  test("signed out is never staff, a campus leader or an admin", () => {
    expect(signedOut).toEqual({
      signedIn: false,
      isStaff: false,
      isCampusLeader: false,
      canAdmin: false,
      canAnnounce: false,
      canMentoring: false,
    });
    expect(
      navViewer(false, { profile: staffProfile, isCampusLeader: true, isAdmin: true })
    ).toEqual(signedOut);
  });

  test("a guest is signed in but not staff", () => {
    expect(guest).toEqual({
      signedIn: true,
      isStaff: false,
      isCampusLeader: false,
      canAdmin: false,
      canAnnounce: false,
      canMentoring: false,
    });
  });

  test("staff still loading their profile are not treated as staff yet", () => {
    expect(navViewer(true, undefined).isStaff).toBe(false);
    expect(navViewer(true, null).isStaff).toBe(false);
  });

  test("admins and the Finance Head can open Admin", () => {
    expect(admin.canAdmin).toBe(true);
    expect(financeHead.canAdmin).toBe(true);
    expect(staff.canAdmin).toBe(false);
  });

  test("only admins send announcements, not the Finance Head", () => {
    expect(admin.canAnnounce).toBe(true);
    expect(financeHead.canAnnounce).toBe(false);
    expect(staff.canAnnounce).toBe(false);
    expect(navViewer(true, { profile: null, isAdmin: true }).canAnnounce).toBe(false);
  });

  test("admins and this year's mentors open Mentoring; staff and guests don't", () => {
    expect(admin.canMentoring).toBe(true);
    expect(mentor.canMentoring).toBe(true);
    expect(staff.canMentoring).toBe(false);
    expect(financeHead.canMentoring).toBe(false);
    expect(navViewer(true, { profile: null, isMentor: true }).canMentoring).toBe(false);
  });

  test("the campus-leader flag only counts for staff", () => {
    expect(campusLeader.isCampusLeader).toBe(true);
    expect(navViewer(true, { profile: null, isCampusLeader: true }).isCampusLeader).toBe(
      false
    );
  });
});

describe("showsReimbursements", () => {
  test("is staff only, minus campus leaders (the old Requests tab rule)", () => {
    expect(showsReimbursements(staff)).toBe(true);
    expect(showsReimbursements(admin)).toBe(true);
    expect(showsReimbursements(campusLeader)).toBe(false);
    expect(showsReimbursements(guest)).toBe(false);
    expect(showsReimbursements(signedOut)).toBe(false);
  });
});

describe("drawerItems", () => {
  test("signed-out people have no drawer", () => {
    expect(drawerItems(signedOut)).toEqual([]);
  });

  test("guests get Profile only", () => {
    expect(drawerItems(guest)).toEqual(["profile"]);
  });

  test("staff get Profile, Churches, Reimbursements, Event Requests and Design Requests", () => {
    expect(drawerItems(staff)).toEqual([
      "profile",
      "calendar",
      "churches",
      "reimbursements",
      "eventRequests",
      "designRequests",
    ]);
  });

  test("admins and the Finance Head also get Admin, last; admins get Announcements before it", () => {
    const withAdmin = ["profile", "calendar", "churches", "reimbursements", "eventRequests", "designRequests", "admin"];
    expect(drawerItems(admin)).toEqual([
      "profile",
      "calendar",
      "churches",
      "reimbursements",
      "eventRequests",
      "designRequests",
      "mentoring",
      "announcements",
      "admin",
    ]);
    expect(drawerItems(financeHead)).toEqual(withAdmin);
  });

  test("mentors get Mentoring without Announcements or Admin", () => {
    expect(drawerItems(mentor)).toEqual([
      "profile",
      "calendar",
      "churches",
      "reimbursements",
      "eventRequests",
      "designRequests",
      "mentoring",
    ]);
  });

  test("campus leaders don't get Reimbursements, Event or Design Requests, but keep Admin", () => {
    expect(drawerItems(campusLeader)).toEqual(["profile", "calendar", "churches"]);
    expect(drawerItems(campusLeaderAdmin)).toEqual([
      "profile",
      "calendar",
      "churches",
      "mentoring",
      "announcements",
      "admin",
    ]);
  });
});

describe("sidebarItems", () => {
  test("signed-out people see the public pages", () => {
    expect(sidebarItems(signedOut)).toEqual(["home", "insights", "org", "churches", "grievances"]);
  });

  test("guests add Profile", () => {
    expect(sidebarItems(guest)).toEqual([
      "home",
      "insights",
      "org",
      "churches",
      "grievances",
      "profile",
    ]);
  });

  test("staff see everything but Admin, in tab order", () => {
    expect(sidebarItems(staff)).toEqual([
      "home",
      "reimbursements",
      "eventRequests",
      "designRequests",
      "attendance",
      "calendar",
      "insights",
      "org",
      "churches",
      "grievances",
      "profile",
    ]);
  });

  test("admins see everything", () => {
    expect(sidebarItems(admin)).toEqual([
      "home",
      "reimbursements",
      "eventRequests",
      "designRequests",
      "attendance",
      "calendar",
      "insights",
      "org",
      "churches",
      "grievances",
      "profile",
      "mentoring",
      "announcements",
      "admin",
    ]);
  });

  test("campus leaders keep Attendance but not Reimbursements", () => {
    expect(sidebarItems(campusLeader)).toEqual([
      "home",
      "attendance",
      "calendar",
      "insights",
      "org",
      "churches",
      "grievances",
      "profile",
    ]);
  });
});

describe("navEntries", () => {
  test("folds the three request pages into one Requests group where the first sat", () => {
    expect(navEntries(drawerItems(admin))).toEqual([
      { kind: "item", key: "profile" },
      { kind: "item", key: "calendar" },
      { kind: "item", key: "churches" },
      {
        kind: "group",
        key: "requests",
        items: ["reimbursements", "eventRequests", "designRequests"],
      },
      { kind: "item", key: "mentoring" },
      { kind: "item", key: "announcements" },
      { kind: "item", key: "admin" },
    ]);
    expect(navEntries(sidebarItems(staff)).slice(0, 3)).toEqual([
      { kind: "item", key: "home" },
      {
        kind: "group",
        key: "requests",
        items: ["reimbursements", "eventRequests", "designRequests"],
      },
      { kind: "item", key: "attendance" },
    ]);
    expect(NAV_GROUP_LABELS.requests).toBe("Requests");
  });

  test("no group when there are no request pages", () => {
    expect(navEntries(drawerItems(campusLeader))).toEqual([
      { kind: "item", key: "profile" },
      { kind: "item", key: "calendar" },
      { kind: "item", key: "churches" },
    ]);
  });
});

describe("activeNavKey", () => {
  test("each menu link's own route highlights it", () => {
    for (const key of Object.keys(NAV_HREFS) as (keyof typeof NAV_HREFS)[]) {
      expect(activeNavKey(NAV_HREFS[key])).toBe(key);
    }
  });

  test("screens opened from a section highlight that section", () => {
    expect(activeNavKey("/request/abc123")).toBe("reimbursements");
    expect(activeNavKey("/review")).toBe("reimbursements");
    expect(activeNavKey("/calendar")).toBe("calendar");
    expect(activeNavKey("/all")).toBe("reimbursements");
    expect(activeNavKey("/design-requests/abc123")).toBe("designRequests");
    expect(activeNavKey("/design-requests/new")).toBe("designRequests");
    expect(activeNavKey("/grievances/new")).toBe("grievances");
    expect(activeNavKey("/event-requests/abc123/risk")).toBe("eventRequests");
    expect(activeNavKey("/event-requests/new")).toBe("eventRequests");
    expect(activeNavKey("/attendance/member/member:abc123")).toBe("attendance");
    expect(activeNavKey("/attendance/event/abc123")).toBe("attendance");
    expect(activeNavKey("/edit-home")).toBe("home");
    expect(activeNavKey("/announcements/abc123")).toBe("announcements");
  });

  test("screens outside any section highlight nothing", () => {
    expect(activeNavKey("/notifications")).toBeNull();
    expect(activeNavKey("/person/someone@sow.org.au")).toBeNull();
    expect(activeNavKey("/e2e-auth")).toBeNull();
    expect(activeNavKey("/attendancex")).toBeNull();
  });
});

describe("roleLine", () => {
  test("shows this year's assignments like the Profile page, without the year", () => {
    expect(
      roleLine({
        roles: ["Head of Department"],
        assignments: [{ role: "Head of Department", department: "Finance" }],
      })
    ).toBe("HOD → Finance");
    expect(
      roleLine({
        roles: ["Head of Department", "Staff"],
        assignments: [
          { role: "Head of Department", department: "Finance" },
          { role: "Staff", department: "Data and IT" },
        ],
      })
    ).toBe("HOD → Finance  ·  Staff → Data and IT");
  });

  test("falls back to roles when there are no assignments", () => {
    expect(roleLine({ roles: ["Director"], assignments: [] })).toBe("Director");
    expect(roleLine({ roles: ["Head of Department", "Staff"] })).toBe("HOD, Staff");
  });

  test("is empty for guests and for staff with nothing assigned", () => {
    expect(roleLine(null)).toBeNull();
    expect(roleLine(undefined)).toBeNull();
    expect(roleLine({ roles: [], assignments: [] })).toBeNull();
  });
});

describe("badgeText", () => {
  test("caps at 99+", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(100)).toBe("99+");
  });
});

describe("NAV_LABELS", () => {
  test("Requests is now called Reimbursements", () => {
    expect(NAV_LABELS.reimbursements).toBe("Reimbursements");
  });
});
