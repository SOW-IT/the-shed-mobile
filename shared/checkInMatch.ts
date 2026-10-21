import { commencementYearFromLevel } from "./attendanceMemberMeta";
import { memberNameMatch, NAME_MATCHES, type NameMatch, nameWords, sameCampus } from "./mergeSuggestions";

export const CHECK_IN_YEAR_LEVELS = ["1", "2", "3", "4", "5", "6+"] as const;
export type CheckInYearLevel = (typeof CHECK_IN_YEAR_LEVELS)[number];

export const isCheckInYearLevel = (value: string): value is CheckInYearLevel =>
  (CHECK_IN_YEAR_LEVELS as readonly string[]).includes(value);

export const yearLevelLabel = (level: string): string => `Year ${level}`;

export const levelForCommencement = (
  commencementYear: number,
  calendarYear: number
): CheckInYearLevel | null => {
  const level = calendarYear - commencementYear + 1;
  if (!Number.isInteger(level) || level < 1) return null;
  return level >= 6 ? "6+" : (String(level) as CheckInYearLevel);
};

export const commencementForLevel = (level: CheckInYearLevel, calendarYear: number): number =>
  commencementYearFromLevel(level, calendarYear)!;

export type CheckInNameMatch = NameMatch | "first" | "last";

const MATCH_ORDER: readonly CheckInNameMatch[] = [...NAME_MATCHES, "first", "last"];

export const checkInNameMatch = (typed: string[], member: string[]): CheckInNameMatch | null => {
  const match = memberNameMatch(typed, member);
  if (match) return match;
  if (typed.length !== 1 || member.length < 2) return null;
  if (member[0] === typed[0]) return "first";
  return member[member.length - 1] === typed[0] ? "last" : null;
};

export type MemberChoice = { memberId: string; name: string; university?: string | null };

export type MemberSuggestion<T extends MemberChoice> = T & { match: CheckInNameMatch };

export const SUGGESTION_LIMIT = 4;

export function suggestMembers<T extends MemberChoice>(
  name: string,
  campus: string | null | undefined,
  members: readonly T[],
  limit = SUGGESTION_LIMIT
): MemberSuggestion<T>[] {
  const typed = nameWords(name);
  if (typed.length === 0) return [];
  const campusRank = (member: T) => (campus && sameCampus(campus, member.university ?? undefined) ? 0 : 1);
  const found: MemberSuggestion<T>[] = [];
  for (const member of members) {
    const match = checkInNameMatch(typed, nameWords(member.name));
    if (match) found.push({ ...member, match });
  }
  return found
    .sort(
      (a, b) =>
        MATCH_ORDER.indexOf(a.match) - MATCH_ORDER.indexOf(b.match) ||
        campusRank(a) - campusRank(b) ||
        a.name.localeCompare(b.name)
    )
    .slice(0, limit);
}

export const SEARCH_LIMIT = 30;

export function searchMembers<T extends MemberChoice>(
  query: string,
  members: readonly T[],
  limit = SEARCH_LIMIT
): T[] {
  const wanted = nameWords(query);
  if (wanted.length === 0) return [];
  const startsAt = (member: T) => {
    const words = nameWords(member.name);
    return wanted.every((w) => words.some((word) => word.startsWith(w))) ? (words[0].startsWith(wanted[0]) ? 0 : 1) : -1;
  };
  return members
    .map((member) => ({ member, rank: startsAt(member) }))
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.member.name.localeCompare(b.member.name))
    .slice(0, limit)
    .map(({ member }) => member);
}

export type CheckInDetails = {
  name: string;
  campus: string | null;
  commencementYear: number | null;
};

export const parseCheckInDetails = (raw: string | null): CheckInDetails | null => {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const { name, campus, commencementYear } = value as Record<string, unknown>;
    if (typeof name !== "string" || !name.trim()) return null;
    return {
      name: name.trim(),
      campus: typeof campus === "string" && campus ? campus : null,
      commencementYear:
        typeof commencementYear === "number" && Number.isInteger(commencementYear) ? commencementYear : null,
    };
  } catch {
    return null;
  }
};
