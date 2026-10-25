import { type MetadataFieldLike, optionIdForLabel, ROLE_FIELD_KEY } from "./attendanceMemberMeta";
import { MEMBER } from "./flow";
import { subgroupMatches } from "./rollcall";
import {
  DEFAULT_WEEKLY_SETTINGS,
  MARKED_VISITOR,
  type WeeklyCategory,
  type WeeklySettings,
} from "./weeklyInsights";

export const ALUMNI = "Alumni";
const VISITOR = MARKED_VISITOR;

export const MARKED_ROLES = [VISITOR, ALUMNI] as const;
export type MarkedRole = (typeof MARKED_ROLES)[number];

export const markedRoleOf = (label: string | null | undefined): MarkedRole | null =>
  MARKED_ROLES.find((role) => role === label?.trim()) ?? null;

export const markedRoleIn = (
  fields: readonly MetadataFieldLike[],
  metadata: Record<string, string> | undefined
): MarkedRole | null => {
  const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
  const raw = roleField ? metadata?.[roleField._id] : undefined;
  return raw ? markedRoleOf(roleField?.values?.[raw] ?? raw) : null;
};

export const withMarkedRole = (
  fields: readonly MetadataFieldLike[],
  submitted: Record<string, string> | undefined,
  previous: Record<string, string> | undefined
): Record<string, string> => {
  const next = { ...(submitted ?? {}) };
  const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
  if (!roleField) return next;
  const raw = next[roleField._id];
  if (raw === previous?.[roleField._id]) return next;
  const marked = raw ? markedRoleOf(roleField.values?.[raw] ?? raw) : null;
  if (marked) next[roleField._id] = optionIdForLabel(roleField.values, marked);
  else delete next[roleField._id];
  return next;
};

const INSIGHTS_ROLES: Partial<Record<WeeklyCategory, string>> = {
  regular: "Regular",
  newcomer: "Newcomer",
  irregular: "Irregular",
  visitor: VISITOR,
};

const CAMPUS_PREFERENCE: WeeklyCategory[] = ["regular", "newcomer", "irregular", "visitor"];

export type CampusCategory = { subgroup: string; category: WeeklyCategory };

export const insightsRoleOf = (
  seen: readonly CampusCategory[],
  homeCampus: string | undefined
): string | null => {
  const counted = seen.filter((s) => INSIGHTS_ROLES[s.category] !== undefined);
  const home = homeCampus
    ? counted.find((s) => subgroupMatches(homeCampus, s.subgroup))
    : undefined;
  const pick =
    home ??
    [...counted].sort(
      (a, b) => CAMPUS_PREFERENCE.indexOf(a.category) - CAMPUS_PREFERENCE.indexOf(b.category)
    )[0];
  return pick ? (INSIGHTS_ROLES[pick.category] ?? null) : null;
};

export type RoleSource = "staff" | "marked" | "insights" | "none";

export const memberRole = ({
  staffRole,
  marked,
  insights,
}: {
  staffRole?: string | null;
  marked?: MarkedRole | null;
  insights?: string | null;
}): { role: string; source: RoleSource } =>
  staffRole
    ? { role: staffRole, source: "staff" }
    : marked
      ? { role: marked, source: "marked" }
      : insights
        ? { role: insights, source: "insights" }
        : { role: MEMBER, source: "none" };

export const ROLE_SOURCE_NOTES: Record<RoleSource, string> = {
  staff: "From their staff profile",
  marked: "Set by hand",
  insights: "From last night's Insights",
  none: "Not at a weekly in the latest term",
};

export const ROLE_FILTER_LABELS = [
  "Staff",
  "Student Leader",
  "Regular",
  "Newcomer",
  "Irregular",
  VISITOR,
  ALUMNI,
  MEMBER,
] as const;

export type RuleSettings = Pick<
  WeeklySettings,
  "regularShare" | "carryOverWeeklies" | "newcomerPromoteWeeklies" | "visitorMinWeeklies"
>;

const shareText = (share: number): string =>
  share === 0.5 ? "half" : `${Math.round(share * 100)}%`;

export const roleRules = (
  settings: RuleSettings = DEFAULT_WEEKLY_SETTINGS
): { role: string; rule: string }[] => [
  {
    role: "Staff and leaders",
    rule: "Their role in their staff profile for the year, set in Admin.",
  },
  {
    role: "Regular",
    rule: `Came to ${shareText(settings.regularShare)} or more of their campus's weeklies in the latest term (last term's count too until ${settings.carryOverWeeklies} have been held).`,
  },
  {
    role: "Newcomer",
    rule: `Their first weekly at the campus was in the latest term. After ${settings.newcomerPromoteWeeklies} or more at the Regular rate, they're Regular.`,
  },
  {
    role: "Irregular",
    rule: "Came to a weekly in the latest term or the one before, but less often than a Regular.",
  },
  {
    role: VISITOR,
    rule: `From another campus and at fewer than ${settings.visitorMinWeeklies} of this campus's weeklies in the term. You can also set it by hand for anyone visiting.`,
  },
  {
    role: ALUMNI,
    rule: "Set by hand once someone has graduated. Insights leaves them out of the student numbers.",
  },
  {
    role: MEMBER,
    rule: "Hasn't been to a weekly in the latest term or the one before.",
  },
];
