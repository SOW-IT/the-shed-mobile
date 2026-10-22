export type MergeSide = {
  name: string;
  email?: string;
  metadata: Record<string, string>;
};

type MergeFieldLike = { _id: string; key: string };

export type MergeConflict = {
  field: string;
  label: string;
  keepValue: string;
  removeValue: string;
  metadataFieldId?: string;
};

export type MergeResolutions = Record<string, "keep" | "remove">;

type MergeOptions = {
  identityLocked?: boolean;
  lockedFieldIds?: readonly string[];
  sameValue?: (fieldId: string, a: string, b: string) => boolean;
};

const exactly = (_fieldId: string, a: string, b: string): boolean => a === b;

const sameName = (a: string, b: string): boolean =>
  a.trim().replace(/\s+/g, " ").toLowerCase() ===
  b.trim().replace(/\s+/g, " ").toLowerCase();

const sameEmail = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

export function detectMergeConflicts(
  keep: MergeSide,
  remove: MergeSide,
  fields: readonly MergeFieldLike[],
  opts: MergeOptions = {}
): MergeConflict[] {
  const conflicts: MergeConflict[] = [];
  const locked = new Set(opts.lockedFieldIds ?? []);
  const same = opts.sameValue ?? exactly;

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
    if (keepValue && removeValue && !same(field._id, keepValue, removeValue)) {
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

export function buildMergedFields(
  keep: MergeSide,
  remove: MergeSide,
  fields: readonly MergeFieldLike[],
  resolutions: MergeResolutions,
  opts: MergeOptions = {}
): MergeSide {
  const locked = new Set(opts.lockedFieldIds ?? []);
  const same = opts.sameValue ?? exactly;
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
    if (!keepValue) {
      metadata[field._id] = removeValue;
    } else if (!same(field._id, keepValue, removeValue)) {
      metadata[field._id] = pick(field._id, keepValue, removeValue);
    }
  }

  return {
    name,
    email: email ? email.toLowerCase() : undefined,
    metadata,
  };
}

export function fieldsTakenFromRemoved(
  keep: MergeSide,
  merged: MergeSide,
  fields: readonly MergeFieldLike[]
): string[] {
  const taken: string[] = [];
  if (merged.name !== keep.name.trim()) taken.push("Name");
  if ((merged.email ?? "") !== (keep.email?.trim().toLowerCase() ?? "")) taken.push("Email");
  for (const field of fields) {
    if ((merged.metadata[field._id] ?? "") !== (keep.metadata[field._id] ?? "")) {
      taken.push(field.key);
    }
  }
  return taken;
}

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
