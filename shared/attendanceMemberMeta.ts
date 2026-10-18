import {
  assignmentsOf,
  MEMBER,
  type ProfileLike,
  rolesOfLike,
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
/** Free text about the person. Notes about one event go on that sign-in. */
export const OTHER_INFO_FIELD_KEY = "Other Information";
/** What the member field was called before notes moved onto each sign-in. */
export const LEGACY_NOTES_FIELD_KEY = "Notes";

export const STAFF_ROLE_FILTER_LABEL = STAFF_ROLE;
export const STUDENT_LEADER_ROLE_FILTER_LABEL = STUDENT_LEADER;
export const STUDENT_LEADER_ROLE_FILTER_ROLES = UNIVERSITY_ROLES;

const YEAR_LEVEL_MAX = 15;

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
  if (fieldValues) return fieldValues[stored] ?? null;
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

type MetadataSelectOption = { id: string; label: string };

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

/** Role takes no new options: it's worked out (shared/memberRole.ts). */
export const metadataFieldAllowsCustomOptions = (
  fieldKey: string,
  fieldNameLocked: boolean
): boolean => !fieldNameLocked || fieldKey === CAMPUS_FIELD_KEY;

/** The subset of an `attendanceMetadata` row these helpers need. */
export type MetadataFieldLike = {
  _id: string;
  key: string;
  values?: Record<string, string>;
};

/** Option id whose label is `label`, or the label itself for free-text values. */
export const optionIdForLabel = (
  values: Record<string, string> | undefined,
  label: string
): string => {
  for (const [id, value] of Object.entries(values ?? {})) {
    if (value === label) return id;
  }
  return label;
};

/**
 * Campus and Role are locked for staff: they mirror the org profile rather
 * than whatever was typed into the member record.
 */
export const staffLockedMetadata = (
  fields: readonly MetadataFieldLike[],
  profile: ProfileLike,
  metadata: Record<string, string> | undefined
): Record<string, string> => {
  const next = { ...(metadata ?? {}) };
  const campusField = fields.find((f) => f.key === CAMPUS_FIELD_KEY);
  const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
  const campus = assignmentsOf(profile).find((a) => a.university)?.university;
  const role = rolesOfLike(profile)[0];

  if (campusField) {
    if (campus) next[campusField._id] = optionIdForLabel(campusField.values, campus);
    else delete next[campusField._id];
  }
  if (roleField) {
    if (role) next[roleField._id] = optionIdForLabel(roleField.values, role);
    else delete next[roleField._id];
  }
  return next;
};

export const sameMetadata = (
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined
): boolean => {
  const filled = (metadata: Record<string, string> | undefined) =>
    Object.entries(metadata ?? {})
      .filter(([, value]) => value !== "")
      .sort(([x], [y]) => x.localeCompare(y));
  return JSON.stringify(filled(a)) === JSON.stringify(filled(b));
};

export const memberOwnMetadata = (
  fields: readonly MetadataFieldLike[],
  submitted: Record<string, string> | undefined,
  previous: Record<string, string> | undefined
): Record<string, string> => {
  const next = { ...(submitted ?? {}) };
  for (const field of fields) {
    if (field.key !== CAMPUS_FIELD_KEY && field.key !== ROLE_FIELD_KEY) continue;
    const kept = previous?.[field._id];
    if (kept) next[field._id] = kept;
    else delete next[field._id];
  }
  return next;
};

/** The member's campus from metadata, else their first org campus. */
export const resolveUniversity = (
  fields: readonly MetadataFieldLike[],
  metadata: Record<string, string> | undefined,
  orgCampuses: readonly string[] = []
): string | undefined => {
  const campusField = fields.find((f) => f.key === CAMPUS_FIELD_KEY);
  if (campusField && metadata) {
    const raw = metadata[campusField._id];
    if (raw) {
      const label = campusField.values?.[raw] ?? raw;
      if (label && label !== "Other") return label;
    }
  }
  return orgCampuses[0];
};

/** "Value · Value" summary of a member's metadata, in field order. */
const subtitlePart = (fieldKey: string, value: string): string | null => {
  if (fieldKey === STUDENT_YEAR_FIELD_KEY) return `Year ${value}`;
  if (fieldKey.endsWith("?")) {
    const answer = value.trim().toLowerCase();
    if (answer === "no") return null;
    return answer === "yes" ? fieldKey.slice(0, -1).trim() : `${fieldKey} ${value}`;
  }
  if (/instagram/i.test(fieldKey)) return value.startsWith("@") ? value : `@${value}`;
  return value;
};

export const metadataSubtitle = (
  fields: readonly MetadataFieldLike[],
  metadata: Record<string, string> | undefined,
  viewingYear: number,
  excludeKeys: Iterable<string> = []
): string => {
  if (!metadata) return "";
  const excluded = new Set(excludeKeys);
  return fields
    .filter((f) => !excluded.has(f.key))
    .map((f) => {
      const raw = metadata[f._id];
      if (!raw) return null;
      const value = formatMetadataFieldValue(f.key, raw, viewingYear, f.values);
      return value ? subtitlePart(f.key, value) : null;
    })
    .filter(Boolean)
    .join(" · ");
};
