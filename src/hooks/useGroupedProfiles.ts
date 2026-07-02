import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";
import {
  DIRECTOR,
  HEAD_OF_DEPARTMENT,
  HEAD_OF_DIVISION,
  departmentsOf,
  divisionsOf,
} from "@shared/flow";

type YearStructure = FunctionReturnType<typeof api.directory.yearStructure>;
type StaffProfiles = FunctionReturnType<typeof api.admin.listStaffProfiles>;

/**
 * Buckets the year's staff profiles for the Users tab using the same hierarchy
 * as the Org Chart: division head, then departments with their department heads
 * first, then department members. Profiles may appear in multiple org-chart
 * placements when they hold multiple scoped roles. Campus groups intentionally
 * include every campus assignment; only the "Other" fallback is deduped from
 * the hierarchy above.
 */
export const useGroupedProfiles = (
  structure: YearStructure | undefined,
  profiles: StaffProfiles | undefined
) =>
  useMemo(() => {
    const profileByEmail = new Map((profiles ?? []).map((p) => [p.email, p]));

    const groupedProfiles = (structure?.divisions ?? []).map((div) => {
      const divDepts = (structure?.departments ?? []).filter(
        (d) => d.division === div.name
      );
      const divDeptNames = new Set(divDepts.map((d) => d.name));
      const divisionHead =
        (div.headEmail ? profileByEmail.get(div.headEmail) : undefined) ??
        (profiles ?? []).find((p) =>
          (p.assignments ?? []).some(
            (a) => a.role === HEAD_OF_DIVISION && a.division === div.name
          )
        ) ??
        null;

      return {
        division: div.name,
        head: divisionHead,
        departments: divDepts
          .map((dept) => {
            const head =
              (dept.headEmail ? profileByEmail.get(dept.headEmail) : undefined) ??
              (profiles ?? []).find((p) =>
                (p.assignments ?? []).some(
                  (a) =>
                    a.role === HEAD_OF_DEPARTMENT && a.department === dept.name
                )
              ) ??
              null;
            const members = (profiles ?? []).filter((p) => {
              if (p.email === head?.email) return false;
              return (p.assignments ?? []).some((a) => a.department === dept.name);
            });

            return {
              name: dept.name,
              colour: dept.colour ?? null,
              head,
              profiles: members,
            };
          })
          .filter((d) => d.head || d.profiles.length > 0),
        divisionOnlyProfiles: (profiles ?? []).filter((p) => {
          if (p.email === divisionHead?.email) return false;
          if (!divisionsOf(p).includes(div.name)) return false;
          return !departmentsOf(p).some((dept) => divDeptNames.has(dept));
        }),
      };
    });

    const groupedEmails = new Set(
      groupedProfiles.flatMap((g) => [
        ...(g.head ? [g.head.email] : []),
        ...g.departments.flatMap((d) => (d.head ? [d.head.email] : [])),
        ...g.departments.flatMap((d) => d.profiles.map((p) => p.email)),
        ...g.divisionOnlyProfiles.map((p) => p.email),
      ])
    );
    const otherProfiles = (profiles ?? []).filter(
      (p) => !groupedEmails.has(p.email)
    );

    // The Director is org-wide (no division/department/campus scope), so it
    // otherwise falls into "Other". Hoist it out to render at the very top, like
    // the Org Chart.
    const director =
      (profiles ?? []).find((p) =>
        (p.assignments ?? []).some((a) => a.role === DIRECTOR)
      ) ?? null;

    const campusProfiles = (profiles ?? []).filter((p) =>
      (p.assignments ?? []).some((a) => a.university)
    );
    const nonCampusOtherProfiles = otherProfiles.filter(
      (p) =>
        p.email !== director?.email &&
        !(p.assignments ?? []).some((a) => a.university)
    );
    const structureUnis = structure?.universities ?? [];
    const extraUnis = [
      ...new Set(
        campusProfiles.flatMap((p) =>
          (p.assignments ?? []).flatMap((a) => (a.university ? [a.university] : []))
        )
      ),
    ].filter((u) => !structureUnis.includes(u));
    const campusUniversities = [...structureUnis, ...extraUnis];
    const campusRoleOrder = [
      "President",
      "Vice President",
      "Executive",
      "Student Leader",
    ];
    const seenInCampus = new Set<string>();
    const campusByUniversity = campusUniversities
      .map((uni) => ({
        university: uni,
        profiles: campusProfiles
          .filter((p) => {
            if (seenInCampus.has(p.email)) return false;
            const match = (p.assignments ?? []).some((a) => a.university === uni);
            if (match) seenInCampus.add(p.email);
            return match;
          })
          .sort((a, b) => {
            const rank = (profile: (typeof campusProfiles)[number]) => {
              const roles = (profile.assignments ?? [])
                .filter((assignment) => assignment.university === uni)
                .map((assignment) => assignment.role);
              const indices = roles
                .map((role) => campusRoleOrder.indexOf(role))
                .filter((index) => index >= 0);
              return indices.length > 0 ? Math.min(...indices) : campusRoleOrder.length;
            };
            const rankDelta = rank(a) - rank(b);
            if (rankDelta !== 0) return rankDelta;
            return (a.name ?? a.email).localeCompare(b.name ?? b.email);
          }),
      }))
      .filter((g) => g.profiles.length > 0);

    return { director, groupedProfiles, campusByUniversity, nonCampusOtherProfiles };
  }, [structure, profiles]);
