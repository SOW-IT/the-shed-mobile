import { type Assignment, formatAssignment, roleLabel, type RoleTitles } from "../../shared/flow";

export type NavKey =
  | "home"
  | "reimbursements"
  | "designRequests"
  | "eventRequests"
  | "attendance"
  | "insights"
  | "org"
  | "profile"
  | "churches"
  | "mentoring"
  | "announcements"
  | "grievances"
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
  churches: "/churches",
  mentoring: "/mentoring",
  announcements: "/announcements",
  grievances: "/grievances",
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
  churches: "Churches",
  mentoring: "Mentoring",
  announcements: "Announcements",
  grievances: "Grievances",
  admin: "Admin",
};

type NavViewer = {
  signedIn: boolean;
  isStaff: boolean;
  isCampusLeader: boolean;
  canAdmin: boolean;
  canAnnounce: boolean;
  canMentoring: boolean;
};

type MeForNav =
  | {
      profile: unknown;
      isCampusLeader?: boolean;
      isAdmin?: boolean;
      isFinanceHead?: boolean;
      isMentor?: boolean;
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
    canMentoring: isStaff && !!(me?.isAdmin || me?.isMentor),
  };
};

export const REQUEST_KEYS = ["reimbursements", "eventRequests", "designRequests"] as const;

export type NavGroupKey = "requests";

export const NAV_GROUP_LABELS: Record<NavGroupKey, string> = { requests: "Requests" };

export type NavEntry =
  | { kind: "item"; key: NavKey }
  | { kind: "group"; key: NavGroupKey; items: NavKey[] };

const isRequestKey = (key: NavKey) => (REQUEST_KEYS as readonly NavKey[]).includes(key);

export const navEntries = (items: NavKey[]): NavEntry[] => {
  const requests = items.filter(isRequestKey);
  const entries: NavEntry[] = [];
  for (const key of items) {
    if (!isRequestKey(key)) entries.push({ kind: "item", key });
    else if (key === requests[0]) entries.push({ kind: "group", key: "requests", items: requests });
  }
  return entries;
};

export const showsReimbursements = (viewer: NavViewer) =>
  viewer.isStaff && !viewer.isCampusLeader;

export const drawerItems = (viewer: NavViewer): NavKey[] => {
  if (!viewer.signedIn) return [];
  const items: NavKey[] = ["profile"];
  if (viewer.isStaff) items.push("churches");
  if (showsReimbursements(viewer)) items.push(...REQUEST_KEYS);
  if (viewer.canMentoring) items.push("mentoring");
  if (viewer.canAnnounce) items.push("announcements");
  if (viewer.canAdmin) items.push("admin");
  return items;
};

export const sidebarItems = (viewer: NavViewer): NavKey[] => {
  const items: NavKey[] = ["home"];
  if (showsReimbursements(viewer)) items.push(...REQUEST_KEYS);
  if (viewer.isStaff) items.push("attendance");
  items.push("insights", "org", "churches", "grievances");
  if (viewer.signedIn) items.push("profile");
  if (viewer.canMentoring) items.push("mentoring");
  if (viewer.canAnnounce) items.push("announcements");
  if (viewer.canAdmin) items.push("admin");
  return items;
};

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
  if (pathname === "/churches") return "churches";
  if (pathname === "/announcements" || pathname.startsWith("/announcements/")) {
    return "announcements";
  }
  if (pathname === "/mentoring") return "mentoring";
  if (pathname === "/grievances" || pathname.startsWith("/grievances/")) return "grievances";
  if (pathname === "/admin") return "admin";
  return null;
};

export const roleLine = (
  profile: { roles: readonly string[]; assignments?: readonly Assignment[] } | null | undefined,
  titles?: RoleTitles
): string | null => {
  if (!profile) return null;
  const assignments = profile.assignments ?? [];
  const text =
    assignments.length > 0
      ? assignments.map((a) => formatAssignment(a, titles)).join("  ·  ")
      : profile.roles.map((r) => roleLabel(r, titles)).join(", ");
  return text || null;
};

export const badgeText = (count: number) => (count > 99 ? "99+" : String(count));
