/**
 * Attendance member metadata helpers — Year is stored as the staff year the
 * person was in first year; the displayed level (1–5, Alumni) is derived from
 * that commencement year and the calendar staff year being viewed.
 */

export const STUDENT_YEAR_FIELD_KEY = "Year";
export const GENDER_FIELD_KEY = "Gender";
export const CAMPUS_FIELD_KEY = "Campus";
export const ROLE_FIELD_KEY = "Role";

export const STUDENT_YEAR_LEVELS = ["1", "2", "3", "4", "5", "Alumni"] as const;

const COMMENCEMENT_YEAR_MIN = 2000;
const COMMENCEMENT_YEAR_MAX = 2100;

/** True when the stored Year value is a commencement staff year (not a legacy option id). */
export const isCommencementStaffYear = (stored: string): boolean => {
  const n = parseInt(stored, 10);
  return (
    Number.isFinite(n) &&
    n >= COMMENCEMENT_YEAR_MIN &&
    n <= COMMENCEMENT_YEAR_MAX &&
    String(n) === stored.trim()
  );
};

/** Derive the student year label for a viewing staff year. */
export const studentYearLevelFromCommencement = (
  commencementStaffYear: number,
  viewingStaffYear: number
): string | null => {
  const level = viewingStaffYear - commencementStaffYear + 1;
  if (level < 1) return null;
  if (level >= 6) return "Alumni";
  return String(level);
};

/** Commencement staff year implied by picking a level in a given staff year. */
export const commencementStaffYearFromLevel = (
  levelLabel: string,
  viewingStaffYear: number
): number | null => {
  if (levelLabel === "Alumni") return viewingStaffYear - 5;
  const n = parseInt(levelLabel, 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return viewingStaffYear - (n - 1);
};

/** Normalise stored Year metadata (commencement year or legacy select id). */
export const resolveCommencementStaffYear = (
  stored: string,
  viewingStaffYear: number,
  yearFieldValues?: Record<string, string>
): number | null => {
  if (!stored) return null;
  if (isCommencementStaffYear(stored)) return parseInt(stored, 10);
  const label = yearFieldValues?.[stored] ?? stored;
  return commencementStaffYearFromLevel(label, viewingStaffYear);
};

/** Select option id for the derived year level (for filters / edit sheet). */
export const yearOptionIdForStoredValue = (
  stored: string,
  viewingStaffYear: number,
  yearFieldValues: Record<string, string>
): string => {
  const commencement = resolveCommencementStaffYear(
    stored,
    viewingStaffYear,
    yearFieldValues
  );
  if (commencement === null) return "";
  const level = studentYearLevelFromCommencement(commencement, viewingStaffYear);
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
  viewingStaffYear: number,
  fieldValues?: Record<string, string>
): string | null => {
  if (!stored) return null;
  if (fieldKey === STUDENT_YEAR_FIELD_KEY) {
    const commencement = resolveCommencementStaffYear(
      stored,
      viewingStaffYear,
      fieldValues
    );
    if (commencement === null) return null;
    return studentYearLevelFromCommencement(commencement, viewingStaffYear);
  }
  if (fieldValues?.[stored]) return fieldValues[stored];
  return stored;
};

/** Persist commencement staff year when the user picks a year level. */
export const encodeYearMetadataValue = (
  selectedOptionId: string,
  viewingStaffYear: number,
  yearFieldValues: Record<string, string>
): string | null => {
  if (!selectedOptionId) return null;
  const label = yearFieldValues[selectedOptionId];
  if (!label) return null;
  const commencement = commencementStaffYearFromLevel(label, viewingStaffYear);
  return commencement !== null ? String(commencement) : null;
};

/** Sort key for Year metadata (numeric level, Alumni last). */
export const yearMetadataSortKey = (
  stored: string,
  viewingStaffYear: number,
  yearFieldValues?: Record<string, string>
): string => {
  const commencement = resolveCommencementStaffYear(
    stored,
    viewingStaffYear,
    yearFieldValues
  );
  if (commencement === null) return "";
  const level = studentYearLevelFromCommencement(commencement, viewingStaffYear);
  if (level === "Alumni") return "6";
  return level ?? "";
};

/** Remove "Other" from Gender select options. */
export const sanitizeGenderValues = (
  values: Record<string, string>
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [id, label] of Object.entries(values)) {
    if (label === "Other" || id === "3") continue;
    out[id] = label;
  }
  return out;
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

/** Campus and Role allow extra options below the org-derived locked set. */
export const metadataFieldAllowsCustomOptions = (
  fieldKey: string,
  fieldNameLocked: boolean
): boolean =>
  !fieldNameLocked ||
  fieldKey === CAMPUS_FIELD_KEY ||
  fieldKey === ROLE_FIELD_KEY;
