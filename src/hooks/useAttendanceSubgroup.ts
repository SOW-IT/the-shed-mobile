import { useState } from "react";
import { defaultAttendanceSubgroup } from "../../shared/rollcall";

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
