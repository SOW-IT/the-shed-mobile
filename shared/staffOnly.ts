import { isSowStaffAddress } from "./rollcallImport";

type StaffOnlyViewer = {
  email: string;
  year: number;
  profile: unknown;
  isCampusLeader?: boolean;
};

const COPY = {
  Event: { lead: "Event requests are for SOW staff", use: "make one" },
  Design: { lead: "Design requests are for SOW staff", use: "make one" },
  Reimbursement: { lead: "Reimbursement requests are for SOW staff", use: "make one" },
  "Praise List": { lead: "The Praise List is for SOW staff", use: "open it" },
};

export const staffOnlyMessage = (kind: keyof typeof COPY, viewer: StaffOnlyViewer): string => {
  const { lead, use } = COPY[kind];
  if (viewer.profile && viewer.isCampusLeader) return `${lead}, not campus leaders.`;
  if (!isSowStaffAddress(viewer.email)) {
    return `${lead}. Sign in with your SOW Google account to ${use}.`;
  }
  return `${lead}. No role or department is assigned to ${viewer.email} for ${viewer.year} yet.`;
};
