export const TEAM_JOBS = [
  "finance",
  "events",
  "design",
  "marketingForm",
  "riskForm",
  "financeForm",
  "admin",
] as const;

export type TeamJob = (typeof TEAM_JOBS)[number];

export type Teams = Record<TeamJob, string>;

export const DEFAULT_TEAMS: Teams = {
  finance: "Finance",
  events: "Events",
  design: "Marketing",
  marketingForm: "Marketing",
  riskForm: "Compliance",
  financeForm: "Finance",
  admin: "Data and IT",
};

export const TEAM_JOB_INFO: Record<TeamJob, { title: string; does: string }> = {
  finance: {
    title: "Finance team",
    does: "Pays reimbursements, sees them all and holds the Finance Head and Budget Manager.",
  },
  events: {
    title: "Events team",
    does: "Sees every event request.",
  },
  design: {
    title: "Design requests",
    does: "Handles every design request; its Head approves them.",
  },
  marketingForm: {
    title: "Marketing form",
    does: "Reviews event requests' Marketing forms.",
  },
  riskForm: {
    title: "Risk form",
    does: "Reviews event requests' Risk forms.",
  },
  financeForm: {
    title: "Finance form",
    does: "Reviews event requests' Finance forms.",
  },
  admin: {
    title: "Always admins",
    does: "Everyone in it is an admin, along with the Director.",
  },
};

export type FormKindForTeams = "marketing" | "risk" | "finance";

export const SUB_FORM_JOBS: Record<FormKindForTeams, TeamJob> = {
  marketing: "marketingForm",
  risk: "riskForm",
  finance: "financeForm",
};

export const subFormTeam = (teams: Teams, kind: FormKindForTeams): string =>
  teams[SUB_FORM_JOBS[kind]];

export const jobsOfDepartment = (teams: Teams, department: string): TeamJob[] =>
  TEAM_JOBS.filter((job) => teams[job] === department);
