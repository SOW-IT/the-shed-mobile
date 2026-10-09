/**
 * Spotting staff who are already in attendance as a member, so an admin can
 * merge the two. A new leader has usually been signed in as a member for a
 * year or more before they join staff, under whatever name the sign-in desk
 * typed; these rules are deliberately loose and an admin confirms each one.
 */

/** Name words in lower case, without accents, punctuation or digits:
 *  "Li-Na  Wu" → ["li", "na", "wu"], "Sam Doe (2005)" → ["sam", "doe"]. */
export const nameWords = (name: string): string[] =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/** How two names line up, strongest first. */
export const NAME_MATCHES = ["same", "spacing", "order", "middle", "short"] as const;
export type NameMatch = (typeof NAME_MATCHES)[number];

const isSubsequence = (short: string[], long: string[]): boolean => {
  let i = 0;
  for (const word of long) if (word === short[i]) i++;
  return i === short.length;
};

/**
 * Whether two names could be the same person:
 * - `same`: "Hana Doe" / "hana  doe"
 * - `spacing`: "Li Na Wu" / "Lina Wu"
 * - `order`: "Doe Hana" / "Hana Doe"
 * - `middle`: "Mary Jane Doe" / "Mary Doe" (one only adds middle names)
 * - `short`: "Alex Morgan" / "Alexander Morgan" (a shortened first
 *   name, at least three letters, with the same surname)
 */
export function nameMatch(a: string[], b: string[]): NameMatch | null {
  if (a.length === 0 || b.length === 0) return null;
  if (a.join(" ") === b.join(" ")) return "same";
  if (a.join("") === b.join("")) return "spacing";
  if (a.length < 2 || b.length < 2) return null;
  if ([...a].sort().join(" ") === [...b].sort().join(" ")) return "order";
  if (a[a.length - 1] !== b[b.length - 1]) return null;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (a[0] === b[0]) {
    return shorter.length < longer.length && isSubsequence(shorter, longer)
      ? "middle"
      : null;
  }
  const [x, y] = a[0].length <= b[0].length ? [a[0], b[0]] : [b[0], a[0]];
  return x.length >= 3 && y.startsWith(x) ? "short" : null;
}

/** A member on another campus than the staff person's isn't them. Either side
 *  without a campus (staff outside campus roles, members never asked) can't
 *  rule a match out. */
export const campusCompatible = (
  staffUniversities: readonly string[],
  memberCampus: string | undefined
): boolean => {
  const campus = memberCampus?.trim().toLowerCase();
  if (!campus || staffUniversities.length === 0) return true;
  return staffUniversities.some((u) => u.trim().toLowerCase() === campus);
};
