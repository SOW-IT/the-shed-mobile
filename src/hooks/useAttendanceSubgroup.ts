import { useState } from "react";
import { defaultAttendanceSubgroup } from "../../shared/rollcall";

/**
 * The sub-group an Attendance/Insights screen is looking at: the user's own
 * campus by default, or whatever they picked. Only an explicit pick is stored,
 * so the default is recomputed once the profile (and its campus) loads even
 * if the sub-group list arrived first.
 */
export const useAttendanceSubgroup = (
  subgroups: string[] | undefined,
  assignments: { role: string; university?: string }[] | undefined
): [string | null, (subgroup: string) => void] => {
  const [selected, setSelected] = useState<string | null>(null);
  const fallback = subgroups?.length
    ? (defaultAttendanceSubgroup(subgroups, assignments) ?? subgroups[0])
    : null;
  const subgroup =
    selected !== null && subgroups?.includes(selected) ? selected : fallback;
  return [subgroup, setSelected];
};
