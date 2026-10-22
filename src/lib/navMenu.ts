import { acronym, type Assignment, formatAssignment } from "../../shared/flow";

export type NavKey =
  | "home"
  | "music"
  | "reimbursements"
  | "designRequests"
  | "eventRequests"
  | "attendance"
  | "insights"
  | "org"
  | "profile"
  | "churches"
  | "announcements"
  | "admin";

export const NAV_HREFS = {
  home: "/home",
  music: "/music",
  reimbursements: "/",
  designRequests: "/design-requests",
  eventRequests: "/event-requests",
  attendance: "/attendance",
  insights: "/insights",
  org: "/org",
  profile: "/profile",
  churches: "/churches",
  announcements: "/announcements",
  admin: "/admin",
} as const satisfies Record<NavKey, string>;

export const NAV_LABELS: Record<NavKey, string> = {
  home: "Home",
  reimbursements: "Reimbursements",
  designRequests: "Design Requests",
  eventRequests: "Event Requests",
  music: "Praise List",
  attendance: "Attendance",
  insights: "Insights",
  org: "Org Chart",
  profile: "Profile",
  churches: "Churches",
  announcements: "Announcements",
  admin: "Admin",
};

type NavViewer = {
  signedIn: boolean;
  isStaff: boolean;
  isCampusLeader: boolean;
  canAdmin: boolean;
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

export const showsReimbursements = (viewer: NavViewer) =>
  viewer.isStaff && !viewer.isCampusLeader;

export const drawerItems = (viewer: NavViewer): NavKey[] => {
  if (!viewer.signedIn) return [];
  const items: NavKey[] = ["profile", "music"];
  if (viewer.isStaff) items.push("churches");
  if (showsReimbursements(viewer)) items.push("reimbursements", "eventRequests", "designRequests");
  if (viewer.canAnnounce) items.push("announcements");
  if (viewer.canAdmin) items.push("admin");
  return items;
};

export const sidebarItems = (viewer: NavViewer): NavKey[] => {
  const items: NavKey[] = ["home"];
  if (viewer.signedIn) items.push("music");
  if (showsReimbursements(viewer)) items.push("reimbursements", "eventRequests", "designRequests");
  if (viewer.isStaff) items.push("attendance");
  items.push("insights", "org", "churches");
  if (viewer.signedIn) items.push("profile");
  if (viewer.canAnnounce) items.push("announcements");
  if (viewer.canAdmin) items.push("admin");
  return items;
};

export const activeNavKey = (pathname: string): NavKey | null => {
  if (pathname === "/" || pathname === "/review" || pathname === "/all") {
    return "reimbursements";
  }
  if (pathname.startsWith("/request/")) return "reimbursements";
  if (
    pathname === "/design-requests" ||
    pathname.startsWith("/design-requests/")
  ) {
    return "designRequests";
  }
  if (
    pathname === "/event-requests" ||
    pathname.startsWith("/event-requests/")
  ) {
    return "eventRequests";
  }
  if (pathname === "/home" || pathname === "/edit-home") return "home";
  if (pathname === "/attendance" || pathname.startsWith("/attendance/")) {
    return "attendance";
  }
  if (pathname === "/insights") return "insights";
  if (pathname === "/org") return "org";
  if (pathname === "/profile") return "profile";
  if (pathname === "/churches") return "churches";
  if (pathname === "/announcements" || pathname.startsWith("/announcements/")) {
    return "announcements";
  }
  if (pathname === "/admin") return "admin";
  if (pathname === "/music" || pathname.startsWith("/music/")) {
    return "music";
  }
  return null;
};

export const roleLine = (
  profile:
    | { roles: readonly string[]; assignments?: readonly Assignment[] }
    | null
    | undefined,
): string | null => {
  if (!profile) return null;
  const assignments = profile.assignments ?? [];
  const text =
    assignments.length > 0
      ? assignments.map(formatAssignment).join("  ·  ")
      : profile.roles.map(acronym).join(", ");
  return text || null;
};

export const badgeText = (count: number) => (count > 99 ? "99+" : String(count));
