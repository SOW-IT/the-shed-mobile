import {
  SUB_FORM_KINDS,
  SUB_FORM_LABELS,
  type FinanceStep,
  type SubFormKind,
} from "./eventRequests";
import {
  DIRECTOR,
  roleTitle,
  stepsForRequest,
  type ApprovalState,
  type ApprovalStep,
  type RoleTitles,
} from "./flow";
import { subFormTeam, type Teams } from "./teams";

export type Persona =
  | { role: "staff"; department: string }
  | { role: "head"; department: string }
  | { role: "director" }
  | { role: "budgetManager" }
  | { role: "praiseManager" }
  | { role: "campusLeader" };

export type Lens =
  { kind: "self" } | { kind: "all" } | { kind: "as"; persona: Persona };

export const SELF_LENS: Lens = { kind: "self" };
export const ALL_VIEWS: Lens = { kind: "all" };
export const ALL_VIEWS_LABEL = "All views";
export const BUDGET_MANAGER_LABEL = "Budget Manager";
export const CAMPUS_LEADER_LABEL = "Campus leader";

export const personaDepartment = (
  persona: Persona,
  teams: Teams,
): string | null => {
  switch (persona.role) {
    case "staff":
    case "head":
      return persona.department;
    case "budgetManager":
      return teams.finance;
    case "director":
    case "praiseManager":
    case "campusLeader":
      return null;
  }
};

const ownDepartment = (persona: Persona): string | null =>
  persona.role === "staff" || persona.role === "head"
    ? persona.department
    : null;

export const personaInDepartment = (
  persona: Persona,
  department: string,
  teams: Teams,
): boolean => personaDepartment(persona, teams) === department;

export const personaHeads = (persona: Persona, department: string): boolean =>
  persona.role === "head" && persona.department === department;

export const personaIsDirector = (persona: Persona): boolean =>
  persona.role === "director";

export const personaIsBudgetManager = (persona: Persona): boolean =>
  persona.role === "budgetManager";

export const personaIsCampusLeader = (persona: Persona): boolean =>
  persona.role === "campusLeader";

export const lensIsCampusLeader = (lens: Lens, isCampusLeader: boolean): boolean =>
  lens.kind === "self"
    ? isCampusLeader
    : lens.kind === "as" && personaIsCampusLeader(lens.persona);

export const personaApproves = (persona: Persona): boolean =>
  persona.role !== "staff" &&
  persona.role !== "praiseManager" &&
  persona.role !== "campusLeader";

export const samePersona = (a: Persona | null, b: Persona | null): boolean =>
  a === null || b === null
    ? a === b
    : a.role === b.role && ownDepartment(a) === ownDepartment(b);

export const personaLabel = (persona: Persona, titles?: RoleTitles): string => {
  switch (persona.role) {
    case "director":
      return roleTitle(DIRECTOR, titles);
    case "budgetManager":
      return BUDGET_MANAGER_LABEL;
    case "praiseManager":
      return "Praise Manager";
    case "campusLeader":
      return CAMPUS_LEADER_LABEL;
    case "head":
      return `${persona.department} Head`;
    case "staff":
      return `${persona.department} staff`;
  }
};

export const departmentHighlights = (
  department: string,
  teams: Teams,
): string[] => [
  ...(department === teams.design ? ["Design requests"] : []),
  ...(department === teams.finance ? ["All reimbursements"] : []),
  ...(department === teams.events ? ["All event requests"] : []),
  ...SUB_FORM_KINDS.filter(
    (kind) => subFormTeam(teams, kind) === department,
  ).map((kind) => `${SUB_FORM_LABELS[kind]} forms`),
];

export const personaHighlights = (persona: Persona, teams: Teams): string[] => {
  const department = personaDepartment(persona, teams);
  return [
    ...(persona.role === "director" ? ["Director approvals"] : []),
    ...(persona.role === "budgetManager" ? ["Budget approvals"] : []),
    ...(persona.role === "praiseManager"
      ? ["Review music requests", "Manage approved songs"]
      : []),
    ...(persona.role === "campusLeader"
      ? ["Opens on Attendance", "No requests or approvals"]
      : []),
    ...(department === null ? [] : departmentHighlights(department, teams)),
  ];
};

export const countWaiting = (...lists: { waiting: boolean }[][]): number =>
  lists.reduce(
    (sum, rows) => sum + rows.filter((row) => row.waiting).length,
    0,
  );

export async function seesThrough(
  lens: Lens,
  real: () => boolean | Promise<boolean>,
  persona: (persona: Persona) => boolean,
): Promise<boolean> {
  if (lens.kind === "all") return true;
  if (lens.kind === "as") return persona(lens.persona);
  return await real();
}

export async function waitsThrough(
  lens: Lens,
  real: () => boolean | Promise<boolean>,
  persona: (persona: Persona) => boolean,
): Promise<boolean> {
  if (lens.kind === "as") return persona(lens.persona);
  return await real();
}

export const personaHoldsStep = (
  persona: Persona,
  step: ApprovalStep,
  department: string,
  teams: Teams,
): boolean => {
  switch (step) {
    case "hod":
      return personaHeads(persona, department);
    case "budgetManager":
      return personaIsBudgetManager(persona);
    case "director":
      return personaIsDirector(persona);
    case "financeHead":
      return personaHeads(persona, teams.finance);
  }
};

export const personaSeesRequest = (
  persona: Persona,
  request: ApprovalState & { department: string },
  teams: Teams,
): boolean =>
  personaInDepartment(persona, teams.finance, teams) ||
  stepsForRequest(request).some((step) =>
    personaHoldsStep(persona, step, request.department, teams),
  );

export const personaOnTeam = (
  persona: Persona,
  kind: SubFormKind,
  teams: Teams,
): boolean => personaInDepartment(persona, subFormTeam(teams, kind), teams);

export const personaReviewsEvents = (persona: Persona, teams: Teams): boolean =>
  personaIsDirector(persona) ||
  SUB_FORM_KINDS.some((kind) => personaOnTeam(persona, kind, teams));

export const personaSeesAllEvents = (persona: Persona, teams: Teams): boolean =>
  personaInDepartment(persona, teams.events, teams) ||
  personaReviewsEvents(persona, teams);

const directorStep = (kind: SubFormKind, step: FinanceStep | undefined) =>
  kind === "finance" && step === "director";

export const personaSeesForm = (
  persona: Persona,
  kind: SubFormKind,
  step: FinanceStep | undefined,
  teams: Teams,
): boolean =>
  directorStep(kind, step)
    ? personaIsDirector(persona) || personaOnTeam(persona, "finance", teams)
    : personaOnTeam(persona, kind, teams);

export const personaApprovesForm = (
  persona: Persona,
  kind: SubFormKind,
  step: FinanceStep | undefined,
  teams: Teams,
): boolean =>
  directorStep(kind, step)
    ? personaIsDirector(persona)
    : personaHeads(persona, subFormTeam(teams, kind));
