import { isSowStaffAddress } from "./rollcallImport";

export type StaffOnlyViewer = {
  email: string;
  year: number;
  profile: unknown;
  isCampusLeader?: boolean;
};

export const staffOnlyMessage = (kind: "Event" | "Design", viewer: StaffOnlyViewer): string => {
  const lead = `${kind} requests are for SOW staff`;
  if (viewer.profile && viewer.isCampusLeader) return `${lead}, not campus leaders.`;
  if (!isSowStaffAddress(viewer.email)) {
    return `${lead}. Sign in with your SOW Google account to make one.`;
  }
  return `${lead}. No role or department is assigned to ${viewer.email} for ${viewer.year} yet.`;
};
