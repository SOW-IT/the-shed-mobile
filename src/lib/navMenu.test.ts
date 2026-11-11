import { describe, expect, test } from "vitest";
import {
  activeNavKey,
  badgeText,
  drawerItems,
  NAV_HREFS,
  navEntries,
  navViewer,
  roleLine,
  showsReimbursements,
  type NavKey,
  sidebarItems,
} from "./navMenu";

const staffProfile = { roles: ["Staff"], assignments: [] };

const signedOut = navViewer(false, undefined);
const guest = navViewer(true, { profile: null });
const staff = navViewer(true, { profile: staffProfile });
const campusLeader = navViewer(true, {
  profile: staffProfile,
  isCampusLeader: true,
});
const admin = navViewer(true, { profile: staffProfile, isAdmin: true });
const financeHead = navViewer(true, {
  profile: staffProfile,
  isFinanceHead: true,
});
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
      navViewer(false, {
        profile: staffProfile,
        isCampusLeader: true,
        isAdmin: true,
      }),
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

  test("only admins can open Admin; the Finance Head's settings live in Reimbursements", () => {
    expect(admin.canAdmin).toBe(true);
    expect(financeHead.canAdmin).toBe(false);
    expect(staff.canAdmin).toBe(false);
  });

  test("only admins send announcements, not the Finance Head", () => {
    expect(admin.canAnnounce).toBe(true);
    expect(financeHead.canAnnounce).toBe(false);
    expect(staff.canAnnounce).toBe(false);
    expect(navViewer(true, { profile: null, isAdmin: true }).canAnnounce).toBe(
      false,
    );
  });

  test("admins and this year's mentors open Mentoring; staff and guests don't", () => {
    expect(admin.canMentoring).toBe(true);
    expect(mentor.canMentoring).toBe(true);
    expect(staff.canMentoring).toBe(false);
    expect(financeHead.canMentoring).toBe(false);
    expect(
      navViewer(true, { profile: null, isMentor: true }).canMentoring,
    ).toBe(false);
  });

  test("the campus-leader flag only counts for staff", () => {
    expect(campusLeader.isCampusLeader).toBe(true);
    expect(
      navViewer(true, { profile: null, isCampusLeader: true }).isCampusLeader,
    ).toBe(false);
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

describe("who sees which pages", () => {
  const REQUESTS: NavKey[] = ["reimbursements", "eventRequests", "designRequests"];
  const PUBLIC: NavKey[] = ["home", "org", "churches", "grievances"];
  const STAFF_PAGES: NavKey[] = ["profile", "music", "attendance", "calendar", "insights"];
  const ADMIN_PAGES: NavKey[] = ["mentoring", "announcements", "admin"];

  test.each([
    [
      "signed-out people",
      signedOut,
      PUBLIC,
      [...STAFF_PAGES, ...REQUESTS, ...ADMIN_PAGES],
    ],
    [
      "guests",
      guest,
      [...PUBLIC, "profile"],
      ["music", "attendance", "calendar", "insights", ...REQUESTS, ...ADMIN_PAGES],
    ],
    ["staff", staff, [...PUBLIC, ...STAFF_PAGES, ...REQUESTS], ADMIN_PAGES],
    ["the Finance Head", financeHead, [...STAFF_PAGES, ...REQUESTS], ADMIN_PAGES],
    [
      "mentors",
      mentor,
      [...STAFF_PAGES, ...REQUESTS, "mentoring"],
      ["announcements", "admin"],
    ],
    ["admins", admin, [...STAFF_PAGES, ...REQUESTS, ...ADMIN_PAGES], []],
    ["campus leaders", campusLeader, STAFF_PAGES, [...REQUESTS, ...ADMIN_PAGES]],
    [
      "campus leaders who are admins",
      campusLeaderAdmin,
      [...STAFF_PAGES, ...ADMIN_PAGES],
      REQUESTS,
    ],
  ] as const)("%s", (_, viewer, shows, hides) => {
    const pages = new Set([
      ...drawerItems(viewer),
      ...sidebarItems(viewer),
    ]);
    expect(shows.filter((key) => !pages.has(key))).toEqual([]);
    expect(hides.filter((key) => pages.has(key))).toEqual([]);
  });

  test("the drawer holds only what the bottom tabs and sidebar leave out", () => {
    expect(drawerItems(signedOut)).toEqual([]);
    expect(drawerItems(guest)).toEqual(["profile"]);
    expect(drawerItems(financeHead)).toEqual(drawerItems(staff));
    for (const viewer of [staff, campusLeader, admin]) {
      const drawer = drawerItems(viewer);
      expect(drawer).toEqual(
        expect.arrayContaining(["profile", "music", "churches", "insights"]),
      );
      expect(
        drawer.filter((key) =>
          ["home", "attendance", "calendar", "org", "grievances"].includes(key),
        ),
      ).toEqual([]);
    }
  });
});

describe("Insights in the menus", () => {
  test("sits at the bottom for everyone who has it there, with only Announcements and Admin below", () => {
    const viewers = [
      guest,
      staff,
      campusLeader,
      admin,
      financeHead,
      mentor,
      campusLeaderAdmin,
    ];
    for (const items of viewers.flatMap((viewer) => [
      drawerItems(viewer),
      sidebarItems(viewer),
    ])) {
      if (!items.includes("insights")) continue;
      const below = items.slice(items.indexOf("insights") + 1);
      expect(
        below.filter((key) => key !== "announcements" && key !== "admin"),
      ).toEqual([]);
      if (items.includes("announcements"))
        expect(below[0]).toBe("announcements");
    }
  });
});

describe("navEntries", () => {
  test("folds the three request pages into one Requests group where the first sat", () => {
    expect(navEntries(drawerItems(admin))).toEqual([
      { kind: "item", key: "profile" },
      { kind: "item", key: "music" },
      { kind: "item", key: "churches" },
      {
        kind: "group",
        key: "requests",
        items: ["reimbursements", "eventRequests", "designRequests"],
      },
      { kind: "item", key: "mentoring" },
      { kind: "item", key: "insights" },
      { kind: "item", key: "announcements" },
      { kind: "item", key: "admin" },
    ]);
    expect(navEntries(sidebarItems(staff)).slice(0, 4)).toEqual([
      { kind: "item", key: "home" },
      {
        kind: "group",
        key: "requests",
        items: ["reimbursements", "eventRequests", "designRequests"],
      },
      { kind: "item", key: "music" },
      { kind: "item", key: "attendance" },
    ]);
  });

  test("no group when there are no request pages", () => {
    expect(navEntries(drawerItems(campusLeader))).toEqual([
      { kind: "item", key: "profile" },
      { kind: "item", key: "music" },
      { kind: "item", key: "churches" },
      { kind: "item", key: "insights" },
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
      }),
    ).toBe("HOD → Finance");
    expect(
      roleLine({
        roles: ["Head of Department", "Staff"],
        assignments: [
          { role: "Head of Department", department: "Finance" },
          { role: "Staff", department: "Data and IT" },
        ],
      }),
    ).toBe("HOD → Finance  ·  Staff → Data and IT");
  });

  test("falls back to roles when there are no assignments", () => {
    expect(roleLine({ roles: ["Director"], assignments: [] })).toBe("Director");
    expect(roleLine({ roles: ["Head of Department", "Staff"] })).toBe(
      "HOD, Staff",
    );
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
