import { MARKETING } from "./designRequests";
import {
  SUB_FORM_KINDS,
  SUB_FORM_LABELS,
  SUB_FORM_TEAMS,
  type FinanceStep,
  type SubFormKind,
} from "./eventRequests";
import {
  DIRECTOR,
  FINANCE,
  roleTitle,
  stepsForRequest,
  type ApprovalState,
  type ApprovalStep,
  type RoleTitles,
} from "./flow";

export type Persona =
  | { role: "staff"; department: string }
  | { role: "head"; department: string }
  | { role: "director" }
  | { role: "budgetManager" };

export type Lens = { kind: "self" } | { kind: "all" } | { kind: "as"; persona: Persona };

export const SELF_LENS: Lens = { kind: "self" };
export const ALL_VIEWS: Lens = { kind: "all" };
export const ALL_VIEWS_LABEL = "All views";
export const BUDGET_MANAGER_LABEL = "Budget Manager";

export const personaDepartment = (persona: Persona): string | null => {
  switch (persona.role) {
    case "staff":
    case "head":
      return persona.department;
    case "budgetManager":
      return FINANCE;
    case "director":
      return null;
  }
};

export const personaInDepartment = (persona: Persona, department: string): boolean =>
  personaDepartment(persona) === department;

export const personaHeads = (persona: Persona, department: string): boolean =>
  persona.role === "head" && persona.department === department;

export const personaIsDirector = (persona: Persona): boolean => persona.role === "director";

export const personaIsBudgetManager = (persona: Persona): boolean =>
  persona.role === "budgetManager";

export const personaApproves = (persona: Persona): boolean => persona.role !== "staff";

export const samePersona = (a: Persona | null, b: Persona | null): boolean =>
  a === null || b === null
    ? a === b
    : a.role === b.role && personaDepartment(a) === personaDepartment(b);

export const personaLabel = (persona: Persona, titles?: RoleTitles): string => {
  switch (persona.role) {
    case "director":
      return roleTitle(DIRECTOR, titles);
    case "budgetManager":
      return BUDGET_MANAGER_LABEL;
    case "head":
      return `${persona.department} Head`;
    case "staff":
      return `${persona.department} staff`;
  }
};

export const departmentHighlights = (department: string): string[] => [
  ...(department === MARKETING ? ["Design requests"] : []),
  ...(department === FINANCE ? ["All reimbursements"] : []),
  ...SUB_FORM_KINDS.filter((kind) => SUB_FORM_TEAMS[kind] === department).map(
    (kind) => `${SUB_FORM_LABELS[kind]} forms`
  ),
];

export const personaHighlights = (persona: Persona): string[] => {
  const department = personaDepartment(persona);
  return [
    ...(persona.role === "director" ? ["Director approvals"] : []),
    ...(persona.role === "budgetManager" ? ["Budget approvals"] : []),
    ...(department === null ? [] : departmentHighlights(department)),
  ];
};

export async function seesThrough(
  lens: Lens,
  real: () => boolean | Promise<boolean>,
  persona: (persona: Persona) => boolean
): Promise<boolean> {
  if (lens.kind === "all") return true;
  if (lens.kind === "as") return persona(lens.persona);
  return await real();
}

export async function waitsThrough(
  lens: Lens,
  real: () => boolean | Promise<boolean>,
  persona: (persona: Persona) => boolean
): Promise<boolean> {
  if (lens.kind === "as") return persona(lens.persona);
  return await real();
}

export const personaHoldsStep = (
  persona: Persona,
  step: ApprovalStep,
  department: string
): boolean => {
  switch (step) {
    case "hod":
      return department !== FINANCE && personaHeads(persona, department);
    case "budgetManager":
      return personaIsBudgetManager(persona);
    case "director":
      return personaIsDirector(persona);
    case "financeHead":
      return personaHeads(persona, FINANCE);
  }
};

export const personaSeesRequest = (
  persona: Persona,
  request: ApprovalState & { department: string }
): boolean =>
  personaInDepartment(persona, FINANCE) ||
  stepsForRequest(request).some((step) => personaHoldsStep(persona, step, request.department));

export const personaOnTeam = (persona: Persona, kind: SubFormKind): boolean =>
  personaInDepartment(persona, SUB_FORM_TEAMS[kind]);

export const personaReviewsEvents = (persona: Persona): boolean =>
  personaIsDirector(persona) || SUB_FORM_KINDS.some((kind) => personaOnTeam(persona, kind));

const directorStep = (kind: SubFormKind, step: FinanceStep | undefined) =>
  kind === "finance" && step === "director";

export const personaSeesForm = (
  persona: Persona,
  kind: SubFormKind,
  step: FinanceStep | undefined
): boolean =>
  directorStep(kind, step)
    ? personaIsDirector(persona) || personaOnTeam(persona, "finance")
    : personaOnTeam(persona, kind);

export const personaApprovesForm = (
  persona: Persona,
  kind: SubFormKind,
  step: FinanceStep | undefined
): boolean =>
  directorStep(kind, step)
    ? personaIsDirector(persona)
    : personaHeads(persona, SUB_FORM_TEAMS[kind]);
