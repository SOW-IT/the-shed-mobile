import { assignmentsOf, formatAssignment, type ProfileLike, roleNeedsUniversity } from "./flow";

export const EXTERNAL_NAME_MAX = 100;
export const EXTERNAL_NOTES_MAX = 1000;

export const isCampusLeaderProfile = (profile: ProfileLike): boolean =>
  assignmentsOf(profile).some((a) => roleNeedsUniversity(a.role));

export const campusLeaderLine = (profile: ProfileLike): string | null => {
  const text = assignmentsOf(profile)
    .filter((a) => roleNeedsUniversity(a.role))
    .map(formatAssignment)
    .join("  ·  ");
  return text || null;
};

export const profileLine = (profile: ProfileLike): string | null => {
  const text = assignmentsOf(profile).map(formatAssignment).join("  ·  ");
  return text || null;
};

export const nameKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, " ");

export const matchesSearch = (
  query: string,
  ...fields: (string | null | undefined)[]
): boolean => {
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
};

export type ExternalMentorDraft = {
  name: string;
  email: string;
  phone: string;
  notes: string;
};

export type CleanExternalMentor = {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
};

const optional = (value: string): string | undefined => value.trim() || undefined;

export const cleanExternalMentor = (draft: ExternalMentorDraft): CleanExternalMentor => ({
  name: draft.name.trim().replace(/\s+/g, " "),
  email: optional(draft.email)?.toLowerCase(),
  phone: optional(draft.phone),
  notes: optional(draft.notes),
});

export const externalMentorError = (draft: ExternalMentorDraft): string | null => {
  const clean = cleanExternalMentor(draft);
  if (!clean.name) return "Enter their name.";
  if (clean.name.length > EXTERNAL_NAME_MAX) {
    return `Keep the name under ${EXTERNAL_NAME_MAX} characters.`;
  }
  if (clean.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    return "Enter a valid email, or leave it blank.";
  }
  if (clean.notes && clean.notes.length > EXTERNAL_NOTES_MAX) {
    return `Keep notes under ${EXTERNAL_NOTES_MAX} characters.`;
  }
  return null;
};

type ExternalLike = { id: string; name: string; email: string | null };

export const sameEmailExternal = <T extends ExternalLike>(
  draft: ExternalMentorDraft,
  externals: readonly T[],
  editingId?: string
): T | null => {
  const email = cleanExternalMentor(draft).email;
  if (!email) return null;
  return externals.find((e) => e.id !== editingId && e.email === email) ?? null;
};

export const sameNameExternal = <T extends ExternalLike>(
  draft: ExternalMentorDraft,
  externals: readonly T[],
  editingId?: string
): T | null => {
  const key = nameKey(draft.name);
  if (!key) return null;
  return externals.find((e) => e.id !== editingId && nameKey(e.name) === key) ?? null;
};

export const pairingsText = (count: number): string =>
  `${count} ${count === 1 ? "pairing" : "pairings"}`;
