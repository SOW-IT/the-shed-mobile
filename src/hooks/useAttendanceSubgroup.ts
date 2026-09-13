import { useEffect, useState } from "react";
import { defaultAttendanceSubgroup } from "../../shared/rollcall";

/**
 * The sub-group an Attendance/Insights screen is looking at: the user's own
 * campus once the sub-group list loads, then whatever they pick.
 */
export const useAttendanceSubgroup = (
  subgroups: string[] | undefined,
  assignments: { role: string; university?: string }[] | undefined
): [string | null, (subgroup: string) => void] => {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!subgroups?.length || selected !== null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default campus once subgroups load
    setSelected(defaultAttendanceSubgroup(subgroups, assignments) ?? subgroups[0]);
  }, [subgroups, selected, assignments]);
  return [selected ?? subgroups?.[0] ?? null, setSelected];
};
