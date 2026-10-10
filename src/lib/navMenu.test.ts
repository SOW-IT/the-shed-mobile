import { describe, expect, test } from "vitest";
import {
  activeNavKey,
  badgeText,
  drawerItems,
  NAV_HREFS,
  NAV_LABELS,
  navViewer,
  roleLine,
  showsDesignRequests,
  showsEventRequests,
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
    });
    // Even if a stale `me` is still around while signing out.
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

describe("showsDesignRequests", () => {
  test("matches Reimbursements: staff who aren't campus leaders", () => {
    expect(showsDesignRequests(staff)).toBe(true);
    expect(showsDesignRequests(campusLeader)).toBe(false);
    expect(showsDesignRequests(guest)).toBe(false);
  });
});

describe("showsEventRequests", () => {
  test("matches Reimbursements: staff above campus leaders", () => {
    expect(showsEventRequests(staff)).toBe(true);
    expect(showsEventRequests(campusLeader)).toBe(false);
    expect(showsEventRequests(guest)).toBe(false);
  });
});

describe("drawerItems", () => {
  test("signed-out people have no drawer", () => {
    expect(drawerItems(signedOut)).toEqual([]);
  });

  test("guests get Profile only", () => {
    expect(drawerItems(guest)).toEqual(["profile"]);
  });

  test("staff get Profile, Reimbursements, Event Requests and Design Requests", () => {
    expect(drawerItems(staff)).toEqual([
      "profile",
      "reimbursements",
      "eventRequests",
      "designRequests",
    ]);
  });

  test("admins and the Finance Head also get Admin, last; admins get Announcements before it", () => {
    const withAdmin = ["profile", "reimbursements", "eventRequests", "designRequests", "admin"];
    expect(drawerItems(admin)).toEqual([
      "profile",
      "reimbursements",
      "eventRequests",
      "designRequests",
      "announcements",
      "admin",
    ]);
    expect(drawerItems(financeHead)).toEqual(withAdmin);
  });

  test("campus leaders don't get Reimbursements, Event or Design Requests, but keep Admin", () => {
    expect(drawerItems(campusLeader)).toEqual(["profile"]);
    expect(drawerItems(campusLeaderAdmin)).toEqual(["profile", "announcements", "admin"]);
  });
});

describe("sidebarItems", () => {
  test("signed-out people see the public pages", () => {
    expect(sidebarItems(signedOut)).toEqual(["home", "insights", "org"]);
  });

  test("guests add Profile", () => {
    expect(sidebarItems(guest)).toEqual(["home", "insights", "org", "profile"]);
  });

  test("staff see everything but Admin, in tab order", () => {
    expect(sidebarItems(staff)).toEqual([
      "home",
      "reimbursements",
      "eventRequests",
      "designRequests",
      "attendance",
      "insights",
      "org",
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
      "insights",
      "org",
      "profile",
      "announcements",
      "admin",
    ]);
  });

  test("campus leaders keep Attendance but not Reimbursements", () => {
    expect(sidebarItems(campusLeader)).toEqual([
      "home",
      "attendance",
      "insights",
      "org",
      "profile",
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
    expect(activeNavKey("/all")).toBe("reimbursements");
    expect(activeNavKey("/design-requests/abc123")).toBe("designRequests");
    expect(activeNavKey("/design-requests/new")).toBe("designRequests");
    expect(activeNavKey("/event-requests/abc123/risk")).toBe("eventRequests");
    expect(activeNavKey("/event-requests/new")).toBe("eventRequests");
    expect(activeNavKey("/attendance/usyd")).toBe("attendance");
    expect(activeNavKey("/attendance/event/new")).toBe("attendance");
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
