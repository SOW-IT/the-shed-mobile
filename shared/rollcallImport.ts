export function canonicalImportMemberName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.toLowerCase() === "daniel kim snr") return "Daniel Kim";
  return trimmed;
}

const normalizedEmail = (email: string | undefined): string | undefined => {
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

export function canonicalStaffEmail(
  email: string | undefined
): string | undefined {
  const lower = normalizedEmail(email);
  if (!lower) return undefined;
  if (lower.endsWith("@sowaustralia.com")) {
    const localPart = lower.slice(0, -"@sowaustralia.com".length);
    if (localPart.includes(".")) return `${localPart}@sow.org.au`;
  }
  return lower;
}

const SOW_STAFF_DOMAINS = ["sow.org.au", "sowaustralia.com"] as const;

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
