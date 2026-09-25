/**
 * Merging two attendance people into one. Ported from the roll-call web app's
 * `merge.ts` (time-to-rollcall #14/#16): the person being merged away hands
 * over their attendance and any details the kept person is missing, and where
 * both have a value that differs the leader picks which one survives.
 *
 * Only a plain member can be merged away. A staff person is always the one
 * kept, and two staff can never be merged — their identity is their org email.
 */

export type MergeSide = {
  name: string;
  email?: string;
  metadata: Record<string, string>;
};

export type MergeFieldLike = { _id: string; key: string };

export type MergeConflict = {
  /** "name", "email", or a metadata field id. */
  field: string;
  label: string;
  keepValue: string;
  removeValue: string;
  /** Set for metadata conflicts so the UI can format the stored value. */
  metadataFieldId?: string;
};

/** Which side's value wins, keyed by `MergeConflict.field`. Missing = keep. */
export type MergeResolutions = Record<string, "keep" | "remove">;

const sameName = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, " ").toLowerCase() ===
  b.trim().replace(/\s+/g, " ").toLowerCase();

const sameEmail = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Fields where both people have a value and the values differ. Locked fields
 * (a staff person's name, email, campus and role come from their profile)
 * never conflict because the kept value can't change.
 */
export function detectMergeConflicts(
  keep: MergeSide,
  remove: MergeSide,
  fields: readonly MergeFieldLike[],
  opts: { identityLocked?: boolean; lockedFieldIds?: readonly string[] } = {}
): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  const locked = new Set(opts.lockedFieldIds ?? []);

  if (!opts.identityLocked) {
    if (keep.name.trim() && remove.name.trim() && !sameName(keep.name, remove.name)) {
      conflicts.push({
        field: "name",
        label: "Name",
        keepValue: keep.name.trim(),
        removeValue: remove.name.trim(),
      });
    }
    if (keep.email && remove.email && !sameEmail(keep.email, remove.email)) {
      conflicts.push({
        field: "email",
        label: "Email",
        keepValue: keep.email,
        removeValue: remove.email,
      });
    }
  }

  for (const field of fields) {
    if (locked.has(field._id)) continue;
    const keepValue = keep.metadata[field._id]?.trim();
    const removeValue = remove.metadata[field._id]?.trim();
    if (keepValue && removeValue && keepValue !== removeValue) {
      conflicts.push({
        field: field._id,
        label: field.key,
        keepValue,
        removeValue,
        metadataFieldId: field._id,
      });
    }
  }
  return conflicts;
}

/**
 * The kept person's details after the merge: conflicts follow `resolutions`,
 * and anything the kept person is missing is filled in from the other side.
 */
export function buildMergedFields(
  keep: MergeSide,
  remove: MergeSide,
  fields: readonly MergeFieldLike[],
  resolutions: MergeResolutions,
  opts: { identityLocked?: boolean; lockedFieldIds?: readonly string[] } = {}
): MergeSide {
  const locked = new Set(opts.lockedFieldIds ?? []);
  const pick = (field: string, keepValue: string, removeValue: string) =>
    resolutions[field] === "remove" ? removeValue : keepValue;

  let name = keep.name.trim() || remove.name.trim();
  let email = keep.email?.trim() || undefined;
  if (!opts.identityLocked) {
    if (keep.name.trim() && remove.name.trim()) {
      name = pick("name", keep.name.trim(), remove.name.trim());
    }
    if (email && remove.email) {
      email = pick("email", email, remove.email.trim());
    } else if (!email && remove.email?.trim()) {
      email = remove.email.trim();
    }
  }

  const metadata = { ...keep.metadata };
  for (const field of fields) {
    if (locked.has(field._id)) continue;
    const keepValue = keep.metadata[field._id]?.trim();
    const removeValue = remove.metadata[field._id]?.trim();
    if (!removeValue) continue;
    metadata[field._id] = keepValue
      ? pick(field._id, keepValue, removeValue)
      : removeValue;
  }

  return {
    name,
    email: email ? email.toLowerCase() : undefined,
    metadata,
  };
}

/** Combines two attendance notes without repeating one already contained. */
export const mergeNotes = (
  existing: string | undefined,
  incoming: string | undefined
): string | undefined => {
  const existingTrimmed = existing?.trim();
  const incomingTrimmed = incoming?.trim();
  if (!existingTrimmed) return incomingTrimmed || undefined;
  if (!incomingTrimmed || existingTrimmed.includes(incomingTrimmed)) {
    return existingTrimmed;
  }
  return `${existingTrimmed}\n${incomingTrimmed}`;
};
