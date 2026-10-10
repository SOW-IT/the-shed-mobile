import { acronym, type Assignment, formatAssignment } from "../../shared/flow";

/** Every place the side menu (phone drawer or wide sidebar) can link to. */
export type NavKey =
  | "home"
  | "reimbursements"
  | "designRequests"
  | "eventRequests"
  | "attendance"
  | "insights"
  | "org"
  | "profile"
  | "announcements"
  | "admin";

export const NAV_HREFS = {
  home: "/home",
  reimbursements: "/",
  designRequests: "/design-requests",
  eventRequests: "/event-requests",
  attendance: "/attendance",
  insights: "/insights",
  org: "/org",
  profile: "/profile",
  announcements: "/announcements",
  admin: "/admin",
} as const satisfies Record<NavKey, string>;

export const NAV_LABELS: Record<NavKey, string> = {
  home: "Home",
  reimbursements: "Reimbursements",
  designRequests: "Design Requests",
  eventRequests: "Event Requests",
  attendance: "Attendance",
  insights: "Insights",
  org: "Org Chart",
  profile: "Profile",
  announcements: "Announcements",
  admin: "Admin",
};

/** What the menu needs to know about whoever is looking at it. */
export type NavViewer = {
  signedIn: boolean;
  /** Has a staff profile for the current year. */
  isStaff: boolean;
  isCampusLeader: boolean;
  /** Admins, plus the Finance Head (who only gets Admin's "Other" tab). */
  canAdmin: boolean;
  /** Admins (the HR division among them) can send announcements. */
  canAnnounce: boolean;
};

type MeForNav =
  | {
      profile: unknown;
      isCampusLeader?: boolean;
      isAdmin?: boolean;
      isFinanceHead?: boolean;
    }
  | null
  | undefined;

export const navViewer = (signedIn: boolean, me: MeForNav): NavViewer => {
  const isStaff = signedIn && !!me?.profile;
  return {
    signedIn,
    isStaff,
    isCampusLeader: isStaff && !!me?.isCampusLeader,
    canAdmin: signedIn && !!(me?.isAdmin || me?.isFinanceHead),
    canAnnounce: isStaff && !!me?.isAdmin,
  };
};

/** Staff get Reimbursements, except campus leaders (they work from Attendance). */
export const showsReimbursements = (viewer: NavViewer) =>
  viewer.isStaff && !viewer.isCampusLeader;

/** Design Requests go to the same people as Reimbursements. */
export const showsDesignRequests = showsReimbursements;

/** So do Event Requests: staff above campus leaders. */
export const showsEventRequests = showsReimbursements;

/**
 * The phone drawer's links. The bottom tabs already cover Home, Attendance,
 * Insights and Org Chart, so it only holds what isn't down there. Signed-out
 * people have no drawer.
 */
export const drawerItems = (viewer: NavViewer): NavKey[] => {
  if (!viewer.signedIn) return [];
  const items: NavKey[] = ["profile"];
  if (showsReimbursements(viewer)) items.push("reimbursements");
  if (showsEventRequests(viewer)) items.push("eventRequests");
  if (showsDesignRequests(viewer)) items.push("designRequests");
  if (viewer.canAnnounce) items.push("announcements");
  if (viewer.canAdmin) items.push("admin");
  return items;
};

/** The wide-screen sidebar's links: the bottom tabs and the drawer's links in one list. */
export const sidebarItems = (viewer: NavViewer): NavKey[] => {
  const items: NavKey[] = ["home"];
  if (showsReimbursements(viewer)) items.push("reimbursements");
  if (showsEventRequests(viewer)) items.push("eventRequests");
  if (showsDesignRequests(viewer)) items.push("designRequests");
  if (viewer.isStaff) items.push("attendance");
  items.push("insights", "org");
  if (viewer.signedIn) items.push("profile");
  if (viewer.canAnnounce) items.push("announcements");
  if (viewer.canAdmin) items.push("admin");
  return items;
};

/** Which menu link a route belongs to, so it can be highlighted. */
export const activeNavKey = (pathname: string): NavKey | null => {
  if (pathname === "/" || pathname === "/review" || pathname === "/all") {
    return "reimbursements";
  }
  if (pathname.startsWith("/request/")) return "reimbursements";
  if (pathname === "/design-requests" || pathname.startsWith("/design-requests/")) {
    return "designRequests";
  }
  if (pathname === "/event-requests" || pathname.startsWith("/event-requests/")) {
    return "eventRequests";
  }
  if (pathname === "/home" || pathname === "/edit-home") return "home";
  if (pathname === "/attendance" || pathname.startsWith("/attendance/")) {
    return "attendance";
  }
  if (pathname === "/insights") return "insights";
  if (pathname === "/org") return "org";
  if (pathname === "/profile") return "profile";
  if (pathname === "/announcements" || pathname.startsWith("/announcements/")) {
    return "announcements";
  }
  if (pathname === "/admin") return "admin";
  return null;
};

/**
 * The menu header's line under your name: this year's assignments as the
 * Profile page shows them (without the year), else your roles. Null when
 * there's nothing to show, e.g. for guests.
 */
export const roleLine = (
  profile: { roles: readonly string[]; assignments?: readonly Assignment[] } | null | undefined
): string | null => {
  if (!profile) return null;
  const assignments = profile.assignments ?? [];
  const text =
    assignments.length > 0
      ? assignments.map(formatAssignment).join("  ·  ")
      : profile.roles.map(acronym).join(", ");
  return text || null;
};

/** A count badge's text, capped like the other badges in the app. */
export const badgeText = (count: number) => (count > 99 ? "99+" : String(count));
