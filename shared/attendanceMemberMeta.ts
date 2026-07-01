/**
 * Attendance member metadata helpers — Year is stored as the **calendar year**
 * the person was in first year (their commencement year); the displayed level
 * (1, 2, 3, …) is derived from that and the calendar year being viewed.
 *
 * The Year level is anchored to the calendar year (Jan 1 rollover) and stays
 * constant across a calendar year. This is deliberately NOT the staff year
 * (Oct 1 rollover) — that's a separate concept that keys staff roles/profiles,
 * which can change at the Oct boundary while a student's Year level does not.
 * Hence the params here are `viewingYear`/`commencementYear`, and every caller
 * passes a calendar year (`sydneyCalendarYear`).
 *
 * The level is uncapped — a sixth-year reads "6", not "6+" — though the picker
 * only offers up to {@link YEAR_LEVEL_MAX} (older members past that still
 * display their real level, they just can't be re-selected from the dropdown).
 */

import {
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

/** Highest year level offered by the Year picker. */
export const YEAR_LEVEL_MAX = 15;

/** Selectable year levels: "1" … "15" (the picker's options, in order). */
export const STUDENT_YEAR_LEVELS: readonly string[] = Array.from(
  { length: YEAR_LEVEL_MAX },
  (_, i) => String(i + 1)
);

/** Year select option map (id → label), id "1" → "1" … "15" → "15". */
export const STUDENT_YEAR_VALUES: Record<string, string> = Object.fromEntries(
  STUDENT_YEAR_LEVELS.map((level) => [level, level])
);

const COMMENCEMENT_YEAR_MIN = 2000;
const COMMENCEMENT_YEAR_MAX = 2100;

/** True when the stored Year value is a commencement (calendar) year, not a legacy option id. */
export const isCommencementYear = (stored: string): boolean => {
  const n = parseInt(stored, 10);
  return (
    Number.isFinite(n) &&
    n >= COMMENCEMENT_YEAR_MIN &&
    n <= COMMENCEMENT_YEAR_MAX &&
    String(n) === stored.trim()
  );
};

/**
 * Derive the student year label for a viewing calendar year. Uncapped: a member
 * in their seventh year reads "7" (not "6+"), so the label always reflects the
 * actual number of years since they commenced.
 */
export const studentYearLevelFromCommencement = (
  commencementYear: number,
  viewingYear: number
): string | null => {
  const level = viewingYear - commencementYear + 1;
  if (level < 1) return null;
  return String(level);
};

/**
 * Commencement (calendar) year implied by picking a level in a given viewing
 * year. Accepts levels 1…{@link YEAR_LEVEL_MAX}; the legacy "6+"/"Alumni" labels
 * still map to a sixth year for data imported before the cap was lifted.
 */
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

/** Normalise stored Year metadata (commencement year or legacy select id). */
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

/** Select option id for the derived year level (for filters / edit sheet). */
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

/** Human-readable label for a metadata field value. */
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

/** Persist the commencement (calendar) year when the user picks a year level. */
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

/**
 * Sort key for Year metadata. Zero-padded so the string compare at the call
 * site orders levels numerically (e.g. "02" before "11"), since levels are no
 * longer capped at a single digit.
 */
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

/** Remove "Other" from Gender select options (by label only — id "3" may be Female in imports). */
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

/** Normalise Gender options to canonical ids: 1 = Male, 2 = Female. */
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

/** Map a stored gender option id to the canonical Male/Female ids. */
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

/** Whether a select option is locked to the org structure (Campus / Role). */
export const isLockedSelectOption = (
  id: string,
  label: string,
  lockedValues?: string[]
): boolean =>
  (lockedValues ?? []).includes(label) || (lockedValues ?? []).includes(id);

/**
 * Split select options into org-locked rows (universities / roles) and custom
 * rows added below them in the metadata editor.
 */
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

/** Locked org options first, then custom options — for pickers and filters. */
export const orderedSelectOptions = (
  values: Record<string, string> | undefined,
  lockedValues: string[] | undefined
): MetadataSelectOption[] => {
  const { locked, custom } = partitionSelectOptions(values, lockedValues);
  return [...locked, ...custom];
};

/** Members tab Role filters are broad buckets, not every org role. */
export const orderedRoleFilterOptions = (
  values: Record<string, string> | undefined,
  lockedValues: string[] | undefined
): MetadataSelectOption[] => {
  const options = orderedSelectOptions(values, lockedValues);
  return ROLE_FILTER_LABELS.map((label) => {
    const existing = options.find((option) => option.label === label);
    return existing ?? { id: label, label };
  });
};

/** Whether a row with staff-profile roles should match a grouped Role filter. */
export const roleFilterMatches = (
  filterLabel: string,
  profileRoles: readonly string[],
  metadataRoleLabel?: string | null
): boolean => {
  const roles = profileRoles.length
    ? profileRoles
    : metadataRoleLabel
      ? [metadataRoleLabel]
      : [];
  if (filterLabel === STUDENT_LEADER_ROLE_FILTER_LABEL) {
    return roles.some((role) =>
      STUDENT_LEADER_ROLE_FILTER_ROLES.includes(
        role as (typeof STUDENT_LEADER_ROLE_FILTER_ROLES)[number]
      )
    );
  }
  if (filterLabel === STAFF_ROLE_FILTER_LABEL) {
    return roles.some(
      (role) =>
        !STUDENT_LEADER_ROLE_FILTER_ROLES.includes(
          role as (typeof STUDENT_LEADER_ROLE_FILTER_ROLES)[number]
        )
    );
  }
  return metadataRoleLabel === filterLabel;
};

/** Campus and Role allow extra options below the org-derived locked set. */
export const metadataFieldAllowsCustomOptions = (
  fieldKey: string,
  fieldNameLocked: boolean
): boolean =>
  !fieldNameLocked ||
  fieldKey === CAMPUS_FIELD_KEY ||
  fieldKey === ROLE_FIELD_KEY;
