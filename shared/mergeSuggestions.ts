export const nameWords = (name: string): string[] =>
  name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

export const NAME_MATCHES = ["same", "spacing", "order", "middle", "short", "typo"] as const;
export type NameMatch = (typeof NAME_MATCHES)[number];

const isSubsequence = (short: string[], long: string[]): boolean => {
  let i = 0;
  for (const word of long) if (word === short[i]) i++;
  return i === short.length;
};

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

export const campusCompatible = (
  staffUniversities: readonly string[],
  memberCampus: string | undefined
): boolean => {
  const campus = memberCampus?.trim().toLowerCase();
  if (!campus || staffUniversities.length === 0) return true;
  return staffUniversities.some((u) => u.trim().toLowerCase() === campus);
};

export const oneEditApart = (a: string, b: string): boolean => {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < shorter.length && shorter[i] === longer[i]) i++;
  return shorter.length === longer.length
    ? shorter.slice(i + 1) === longer.slice(i + 1)
    : shorter.slice(i) === longer.slice(i + 1);
};

export const memberNameMatch = (a: string[], b: string[]): NameMatch | null => {
  const match = nameMatch(a, b);
  if (match) return match;
  if (a.length < 2 || b.length < 2) return null;
  return oneEditApart(a.join(" "), b.join(" ")) ? "typo" : null;
};

export const sameCampus = (a: string | undefined, b: string | undefined): boolean => {
  const x = a?.trim().toLowerCase() || undefined;
  const y = b?.trim().toLowerCase() || undefined;
  return x === y;
};

type DuplicateCandidate = { id: string; words: string[]; campus?: string };
type DuplicatePair<T extends DuplicateCandidate> = { a: T; b: T; match: NameMatch };

export function duplicatePairs<T extends DuplicateCandidate>(people: readonly T[]): DuplicatePair<T>[] {
  const buckets = new Map<string, T[]>();
  for (const person of people) {
    const keys = new Set([person.words[0], person.words[person.words.length - 1]]);
    for (const key of keys) {
      if (!key) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(person);
      buckets.set(key, bucket);
    }
  }
  const compared = new Set<string>();
  const pairs: DuplicatePair<T>[] = [];
  for (const bucket of buckets.values()) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const [a, b] = bucket[i].id < bucket[j].id ? [bucket[i], bucket[j]] : [bucket[j], bucket[i]];
        const key = `${a.id}|${b.id}`;
        if (compared.has(key)) continue;
        compared.add(key);
        if (!sameCampus(a.campus, b.campus)) continue;
        const match = memberNameMatch(a.words, b.words);
        if (match) pairs.push({ a, b, match });
      }
    }
  }
  return pairs;
}
