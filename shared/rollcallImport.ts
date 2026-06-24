/** Normalise legacy roll-call member names for import. */
export function canonicalImportMemberName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.toLowerCase() === "daniel kim snr") return "Daniel Kim";
  return trimmed;
}

const normalizedEmail = (email: string | undefined): string | undefined => {
  const lower = email?.trim().toLowerCase();
  return lower && lower.includes("@") ? lower : undefined;
};

/**
 * Map legacy roll-call emails (`first.last@sowaustralia.com`) and special cases
 * to the staff profile email used in `staffProfiles` (`first.last@sow.org.au`).
 */
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

/** Prefer staff profile email when legacy data can be mapped. */
export function resolveImportStaffEmail(member: {
  name: string;
  email?: string;
}): string | undefined {
  return (
    canonicalStaffEmailFromLegacy(member) ?? normalizedEmail(member.email)
  );
}
