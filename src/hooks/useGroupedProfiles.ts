import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import { departmentsOf, divisionsOf } from "@shared/flow";

type YearStructure = FunctionReturnType<typeof api.directory.yearStructure>;
type StaffProfiles = FunctionReturnType<typeof api.admin.listStaffProfiles>;

/**
 * Buckets the year's staff profiles for the Users tab: by division → department,
 * then the leftovers ("Other") split into campus roles grouped by university and
 * everyone else. A profile lands in exactly one bucket — the `seen*` sets make
 * the passes mutually exclusive in division/department/university order.
 *
 * Pure derivation over the two queries, memoised so it only recomputes when the
 * structure or profile list actually changes.
 */
export const useGroupedProfiles = (
  structure: YearStructure | undefined,
  profiles: StaffProfiles | undefined
) =>
  useMemo(() => {
    const groupedProfiles = (structure?.divisions ?? []).map((div) => {
      const seenInDepartments = new Set<string>();
      const divDepts = (structure?.departments ?? []).filter(
        (d) => d.division === div.name
      );
      const divDeptNames = new Set(divDepts.map((d) => d.name));
      return {
        division: div.name,
        departments: divDepts
          .map((dept) => ({
            name: dept.name,
            profiles: (profiles ?? []).filter((p) => {
              if (seenInDepartments.has(p.email)) return false;
              const inDept = (p.assignments ?? []).some(
                (a) => a.department === dept.name
              );
              if (inDept) seenInDepartments.add(p.email);
              return inDept;
            }),
          }))
          .filter((d) => d.profiles.length > 0),
        divisionOnlyProfiles: (profiles ?? []).filter((p) => {
          if (!divisionsOf(p).includes(div.name)) return false;
          return !departmentsOf(p).some((dept) => divDeptNames.has(dept));
        }),
      };
    });
    const groupedEmails = new Set(
      groupedProfiles.flatMap((g) => [
        ...g.departments.flatMap((d) => d.profiles.map((p) => p.email)),
        ...g.divisionOnlyProfiles.map((p) => p.email),
      ])
    );
    const otherProfiles = (profiles ?? []).filter(
      (p) => !groupedEmails.has(p.email)
    );

    // Within otherProfiles, group campus roles (SL / Exec / VP / President) by university.
    const campusProfiles = otherProfiles.filter((p) =>
      (p.assignments ?? []).some((a) => a.university)
    );
    const nonCampusOtherProfiles = otherProfiles.filter(
      (p) => !(p.assignments ?? []).some((a) => a.university)
    );
    // Derive university order from structure list, then append any extras found on profiles.
    const structureUnis = structure?.universities ?? [];
    const extraUnis = [
      ...new Set(
        campusProfiles.flatMap((p) =>
          (p.assignments ?? []).flatMap((a) => (a.university ? [a.university] : []))
        )
      ),
    ].filter((u) => !structureUnis.includes(u));
    const campusUniversities = [...structureUnis, ...extraUnis];
    const seenInCampus = new Set<string>();
    const campusByUniversity = campusUniversities
      .map((uni) => ({
        university: uni,
        profiles: campusProfiles.filter((p) => {
          if (seenInCampus.has(p.email)) return false;
          const match = (p.assignments ?? []).some((a) => a.university === uni);
          if (match) seenInCampus.add(p.email);
          return match;
        }),
      }))
      .filter((g) => g.profiles.length > 0);

    return { groupedProfiles, campusByUniversity, nonCampusOtherProfiles };
  }, [structure, profiles]);
