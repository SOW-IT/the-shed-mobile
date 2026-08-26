import {
  MEMBER,
  ROLES,
  STAFF_ROLE,
  STUDENT_LEADER,
  UNIVERSITY_ROLES,
} from "./flow";

export const STUDENT_YEAR_FIELD_KEY = "Year";
export const GENDER_FIELD_KEY = "Gender";

export const GENDER_VALUES: Record<string, string> = {
  "1": "Male",
  "2": "Female",
};

export const GENDER_OPTION_IDS = ["1", "2"] as const;
export const CAMPUS_FIELD_KEY = "Campus";
export const ROLE_FIELD_KEY = "Role";

export const STAFF_ROLE_FILTER_LABEL = STAFF_ROLE;
export const STUDENT_LEADER_ROLE_FILTER_LABEL = STUDENT_LEADER;
export const STUDENT_LEADER_ROLE_FILTER_ROLES = UNIVERSITY_ROLES;
export const ROLE_FILTER_LABELS = [
  STAFF_ROLE_FILTER_LABEL,
  STUDENT_LEADER_ROLE_FILTER_LABEL,
] as const;
const ROLE_FILTER_LABEL_SET = new Set<string>(ROLE_FILTER_LABELS);
const STAFF_PROFILE_ROLE_FILTER_LABELS = new Set<string>(
  ROLES.filter((role) => role !== MEMBER)
);

export const YEAR_LEVEL_MAX = 15;

export const STUDENT_YEAR_LEVELS: readonly string[] = Array.from(
  { length: YEAR_LEVEL_MAX },
  (_, i) => String(i + 1)
);

export const STUDENT_YEAR_VALUES: Record<string, string> = Object.fromEntries(
  STUDENT_YEAR_LEVELS.map((level) => [level, level])
);

const COMMENCEMENT_YEAR_MIN = 2000;
const COMMENCEMENT_YEAR_MAX = 2100;

export const isCommencementYear = (stored: string): boolean => {
  const n = parseInt(stored, 10);
  return (
    Number.isFinite(n) &&
    n >= COMMENCEMENT_YEAR_MIN &&
    n <= COMMENCEMENT_YEAR_MAX &&
    String(n) === stored.trim()
  );
};

export const studentYearLevelFromCommencement = (
  commencementYear: number,
  viewingYear: number
): string | null => {
  const level = viewingYear - commencementYear + 1;
  if (level < 1) return null;
  return String(level);
};

export const commencementYearFromLevel = (
  levelLabel: string,
  viewingYear: number
): number | null => {
  if (levelLabel === "Alumni" || levelLabel === "6+") {
    return viewingYear - 5;
  }
  const n = parseInt(levelLabel, 10);
  if (!Number.isFinite(n) || n < 1 || n > YEAR_LEVEL_MAX) return null;
  return viewingYear - (n - 1);
};

export const resolveCommencementYear = (
  stored: string,
  viewingYear: number,
  yearFieldValues?: Record<string, string>
): number | null => {
  if (!stored) return null;
  if (isCommencementYear(stored)) return parseInt(stored, 10);
  const label = yearFieldValues?.[stored] ?? stored;
  return commencementYearFromLevel(label, viewingYear);
};

export const yearOptionIdForStoredValue = (
  stored: string,
  viewingYear: number,
  yearFieldValues: Record<string, string>
): string => {
  const commencement = resolveCommencementYear(
    stored,
    viewingYear,
    yearFieldValues
  );
  if (commencement === null) return "";
  const level = studentYearLevelFromCommencement(commencement, viewingYear);
  if (!level) return "";
  for (const [id, label] of Object.entries(yearFieldValues)) {
    if (label === level) return id;
  }
  return "";
};

export const formatMetadataFieldValue = (
  fieldKey: string,
  stored: string,
  viewingYear: number,
  fieldValues?: Record<string, string>
): string | null => {
  if (!stored) return null;
  if (fieldKey === STUDENT_YEAR_FIELD_KEY) {
    const commencement = resolveCommencementYear(
      stored,
      viewingYear,
      fieldValues
    );
    if (commencement === null) return null;
    return studentYearLevelFromCommencement(commencement, viewingYear);
  }
  if (fieldValues?.[stored]) return fieldValues[stored];
  return stored;
};

export const encodeYearMetadataValue = (
  selectedOptionId: string,
  viewingYear: number,
  yearFieldValues: Record<string, string>
): string | null => {
  if (!selectedOptionId) return null;
  const label = yearFieldValues[selectedOptionId];
  if (!label) return null;
  const commencement = commencementYearFromLevel(label, viewingYear);
  return commencement !== null ? String(commencement) : null;
};

export const yearMetadataSortKey = (
  stored: string,
  viewingYear: number,
  yearFieldValues?: Record<string, string>
): string => {
  const commencement = resolveCommencementYear(
    stored,
    viewingYear,
    yearFieldValues
  );
  if (commencement === null) return "";
  const level = studentYearLevelFromCommencement(commencement, viewingYear);
  return level ? level.padStart(2, "0") : "";
};

export const sanitizeGenderValues = (
  values: Record<string, string>
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [id, label] of Object.entries(values)) {
    if (label.trim().toLowerCase() === "other") continue;
    out[id] = label;
  }
  return out;
};

export const canonicalizeGenderValues = (
  values: Record<string, string> | undefined
): Record<string, string> => {
  const sanitized = sanitizeGenderValues(values ?? {});
  const out = { ...GENDER_VALUES };
  for (const label of Object.values(sanitized)) {
    const lower = label.trim().toLowerCase();
    if (lower === "male") out["1"] = "Male";
    else if (lower === "female") out["2"] = "Female";
  }
  return out;
};

export const canonicalizeGenderOptionId = (
  stored: string,
  fieldValues?: Record<string, string>
): string => {
  const label = fieldValues?.[stored]?.trim().toLowerCase();
  if (label === "male") return "1";
  if (label === "female") return "2";
  if (stored === "1" || stored === "2") return stored;
  return stored;
};

export type MetadataSelectOption = { id: string; label: string };

export const isLockedSelectOption = (
  id: string,
  label: string,
  lockedValues?: string[]
): boolean =>
  (lockedValues ?? []).includes(label) || (lockedValues ?? []).includes(id);

export const partitionSelectOptions = (
  values: Record<string, string> | undefined,
  lockedValues: string[] | undefined
): { locked: MetadataSelectOption[]; custom: MetadataSelectOption[] } => {
  const lockedOrder = lockedValues ?? [];
  const locked: MetadataSelectOption[] = [];
  const custom: MetadataSelectOption[] = [];
  for (const [id, label] of Object.entries(values ?? {})) {
    const opt = { id, label };
    if (isLockedSelectOption(id, label, lockedValues)) locked.push(opt);
    else custom.push(opt);
  }
  locked.sort((a, b) => {
    const ai = lockedOrder.indexOf(a.label);
    const bi = lockedOrder.indexOf(b.label);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1;
    if (bi >= 0) return 1;
    return a.label.localeCompare(b.label);
  });
  custom.sort((a, b) => {
    const an = Number(a.id);
    const bn = Number(b.id);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.id.localeCompare(b.id);
  });
  return { locked, custom };
};

export const orderedSelectOptions = (
  values: Record<string, string> | undefined,
  lockedValues: string[] | undefined
): MetadataSelectOption[] => {
  const { locked, custom } = partitionSelectOptions(values, lockedValues);
  return [...locked, ...custom];
};

export const orderedRoleFilterOptions = (
  values: Record<string, string> | undefined,
  lockedValues: string[] | undefined
): MetadataSelectOption[] => {
  const options = orderedSelectOptions(values, lockedValues);
  const grouped = ROLE_FILTER_LABELS.map((label) => {
    const existing = options.find((option) => option.label === label);
    return existing ?? { id: label, label };
  });
  const extraAttendanceRoles = options.filter((option) => {
    if (ROLE_FILTER_LABEL_SET.has(option.label)) return false;
    if (option.label === MEMBER) return true;
    if (STAFF_PROFILE_ROLE_FILTER_LABELS.has(option.label)) return false;
    return !isLockedSelectOption(option.id, option.label, lockedValues);
  });
  return [...grouped, ...extraAttendanceRoles];
};

export const roleFilterMatches = (
  filterLabel: string,
  profileRoles: readonly string[],
  metadataRoleLabel?: string | null
): boolean => {
  if (filterLabel === STUDENT_LEADER_ROLE_FILTER_LABEL) {
    const roles = profileRoles.length
      ? profileRoles
      : metadataRoleLabel
        ? [metadataRoleLabel]
        : [];
    return roles.some((role) =>
      STUDENT_LEADER_ROLE_FILTER_ROLES.includes(
        role as (typeof STUDENT_LEADER_ROLE_FILTER_ROLES)[number]
      )
    );
  }
  if (filterLabel === STAFF_ROLE_FILTER_LABEL) {
    return profileRoles.some(
      (role) =>
        !STUDENT_LEADER_ROLE_FILTER_ROLES.includes(
          role as (typeof STUDENT_LEADER_ROLE_FILTER_ROLES)[number]
        ) && role !== MEMBER
    );
  }
  return metadataRoleLabel === filterLabel;
};

export const metadataFieldAllowsCustomOptions = (
  fieldKey: string,
  fieldNameLocked: boolean
): boolean =>
  !fieldNameLocked ||
  fieldKey === CAMPUS_FIELD_KEY ||
  fieldKey === ROLE_FIELD_KEY;
