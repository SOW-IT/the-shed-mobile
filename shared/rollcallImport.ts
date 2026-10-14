export function canonicalImportMemberName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.toLowerCase() === "daniel kim snr") return "Daniel Kim";
  return trimmed;
}

export const normalizedEmail = (email: string | undefined): string | undefined => {
  const lower = email?.trim().toLowerCase();
  return lower && lower.includes("@") ? lower : undefined;
};

export function canonicalStaffEmailFromLegacy(member: {
  name: string;
  email?: string;
}): string | null {
  if (member.name.trim().toLowerCase() === "daniel kim snr") {
    return "daniel.kim@sow.org.au";
  }
  const email = normalizedEmail(member.email);
  if (!email?.endsWith("@sowaustralia.com")) return null;
  const localPart = email.slice(0, -"@sowaustralia.com".length);
  if (!localPart.includes(".")) return null;
  return `${localPart}@sow.org.au`;
}

export function resolveImportStaffEmail(member: {
  name: string;
  email?: string;
}): string | undefined {
  return (
    canonicalStaffEmailFromLegacy(member) ?? normalizedEmail(member.email)
  );
}

const SOW_STAFF_DOMAINS = ["sow.org.au", "sowaustralia.com"] as const;

/** An SOW address (sow.org.au or sowaustralia.com): a staff email, never
 *  someone's personal one. */
export const isSowStaffAddress = (email: string | undefined): boolean => {
  const lower = email?.trim().toLowerCase() ?? "";
  const at = lower.lastIndexOf("@");
  return at > 0 && (SOW_STAFF_DOMAINS as readonly string[]).includes(lower.slice(at + 1));
};

export function staffEmailCandidates(email: string | undefined): string[] {
  const lower = normalizedEmail(email);
  if (!lower) return [];
  const at = lower.lastIndexOf("@");
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  if (SOW_STAFF_DOMAINS.includes(domain as (typeof SOW_STAFF_DOMAINS)[number])) {
    return SOW_STAFF_DOMAINS.map((d) => `${local}@${d}`);
  }
  return [lower];
}

export function canonicalEmailKey(email: string | undefined): string | undefined {
  return staffEmailCandidates(email)[0];
}

/** Latest staff year for each email spelling, earlier than `viewedYear`. */
export function previousStaffYearByEmailKey(
  profiles: readonly { email: string; year: number }[],
  viewedYear: number
): Map<string, number> {
  const map = new Map<string, number>();
  for (const profile of profiles) {
    if (profile.year >= viewedYear) continue;
    for (const key of staffEmailCandidates(profile.email)) {
      const current = map.get(key);
      if (current === undefined || profile.year > current) {
        map.set(key, profile.year);
      }
    }
  }
  return map;
}

export function previousStaffYearForEmail(
  previousByEmail: ReadonlyMap<string, number>,
  email: string
): number | undefined {
  let latest: number | undefined;
  for (const key of staffEmailCandidates(email)) {
    const year = previousByEmail.get(key);
    if (year !== undefined && (latest === undefined || year > latest)) {
      latest = year;
    }
  }
  return latest;
}

export function uniqueStaffByEmail<T extends { email: string }>(
  rows: readonly T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = canonicalEmailKey(row.email) ?? row.email;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
