import { roleNeedsUniversity, universityColour } from "../../../shared/flow";
import { contrastingText, subgroupLabel } from "../../../shared/rollcall";

/**
 * The small campus / STAFF / OTHER pill shown beside a person in attendance
 * lists, so every list renders it the same way.
 */
export const campusPill = (
  university: string | undefined,
  roles: readonly string[],
  theme: { ghost: string; ghostText: string }
): { label: string; background: string; text: string; colour?: string } => {
  const colour = university ? universityColour(university) : undefined;
  const hasStaffRole = roles.some((role) => !roleNeedsUniversity(role));
  return {
    label: university ? subgroupLabel(university) : hasStaffRole ? "STAFF" : "OTHER",
    background: colour ?? theme.ghost,
    text: colour ? contrastingText(colour) : theme.ghostText,
    colour,
  };
};
