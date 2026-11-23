import { acronym, type Assignment, HEAD_OF_DEPARTMENT, roleTitle, type RoleTitles } from "./flow";

export type OrgPerson = { email: string; name: string | null; photo: string | null; role: string | null };

type OrgDepartment = {
  name: string;
  colour: string | null;
  head: OrgPerson | null;
  members: readonly OrgPerson[];
};

export type OrgDivision = { name: string; head: OrgPerson | null; departments: readonly OrgDepartment[] };

export type OrgCampus = { name: string; members: readonly OrgPerson[] };

export type OrgChartSections = {
  roleTitles: RoleTitles;
  director: OrgPerson | null;
  staff: readonly OrgPerson[];
  divisions: readonly OrgDivision[];
  universities: readonly OrgCampus[];
};

type OrgAreaKind = "staff" | "division" | "campus";

type OrgArea = { key: string; kind: OrgAreaKind; name: string; label: string };

const STAFF_SECTION = "Staff";
export const STAFF_AREA = "staff";

export const divisionArea = (name: string) => `division:${name}`;
export const campusArea = (name: string) => `campus:${name}`;

export const departmentHeadTitle = (titles: RoleTitles) => titles[HEAD_OF_DEPARTMENT] ?? "Head of Dept";

export const orgSearchTerms = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const ORG_SEARCH_MIN_LENGTH = 2;

export const isOrgSearchQuery = (query: string) => query.trim().length >= ORG_SEARCH_MIN_LENGTH;

export const refinesOrgSearch = (typed: string, searched: string) =>
  typed.trim().toLowerCase().startsWith(searched.trim().toLowerCase());

type SearchableProfile = {
  email: string;
  name?: string;
  otherNames?: readonly (string | null | undefined)[];
  assignments?: readonly Assignment[];
  titles?: RoleTitles;
  departmentDivisions?: Readonly<Record<string, string>>;
};

export const staffProfileSearchText = (profile: SearchableProfile) => {
  const titles = profile.titles ?? {};
  const words = [
    profile.name,
    ...(profile.otherNames ?? []),
    profile.email,
    ...(profile.assignments ?? []).flatMap((a) => [
      a.role,
      roleTitle(a.role, titles),
      acronym(a.role),
      a.role === HEAD_OF_DEPARTMENT ? departmentHeadTitle(titles) : null,
      ...[a.department, a.division, a.university, a.department && profile.departmentDivisions?.[a.department]].flatMap(
        (scope) => (scope ? [scope, acronym(scope)] : [])
      ),
    ]),
  ];
  return [...new Set(words.filter((word): word is string => !!word))].join(" ");
};

const ORG_SEARCH_INDEX_WORDS = 3;

export const orgSearchIndexWords = (terms: readonly string[]) =>
  [...new Set(terms.flatMap((term) => term.split(/[^\p{L}\p{N}]+/u)).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .slice(0, ORG_SEARCH_INDEX_WORDS);

export const matchesOrgSearch = (terms: readonly string[], text: string) => {
  const haystack = text.toLowerCase();
  return terms.every((term) => haystack.includes(term));
};

const divisionPeople = (division: OrgDivision) => [
  division.head,
  ...division.departments.flatMap((department) => [department.head, ...department.members]),
];

const countPeople = (people: readonly (OrgPerson | null)[]) =>
  new Set(people.flatMap((person) => (person ? [person.email] : []))).size;

export const focusOrgChart = (chart: OrgChartSections, email: string | null): OrgChartSections => {
  if (!email) return chart;
  const target = email.toLowerCase();
  const isTarget = (person: OrgPerson) => person.email.toLowerCase() === target;
  const kept = (person: OrgPerson | null) => (person && isTarget(person) ? person : null);
  return {
    roleTitles: chart.roleTitles,
    director: kept(chart.director),
    staff: chart.staff.filter(isTarget),
    divisions: chart.divisions
      .map((division) => ({
        ...division,
        head: kept(division.head),
        departments: division.departments
          .map((department) => ({
            ...department,
            head: kept(department.head),
            members: department.members.filter(isTarget),
          }))
          .filter((department) => department.head || department.members.length > 0),
      }))
      .filter((division) => division.head || division.departments.length > 0),
    universities: chart.universities.map((campus) => ({ ...campus, members: campus.members.filter(isTarget) })),
  };
};

export const orgAreas = (chart: OrgChartSections): OrgArea[] => [
  ...(chart.staff.length > 0
    ? [{ key: STAFF_AREA, kind: "staff" as const, name: STAFF_SECTION, label: STAFF_SECTION }]
    : []),
  ...chart.divisions
    .filter((division) => countPeople(divisionPeople(division)) > 0)
    .map((division) => ({
      key: divisionArea(division.name),
      kind: "division" as const,
      name: division.name,
      label: division.name,
    })),
  ...chart.universities
    .filter((campus) => campus.members.length > 0)
    .map((campus) => ({
      key: campusArea(campus.name),
      kind: "campus" as const,
      name: campus.name,
      label: acronym(campus.name),
    })),
];

export const orgAreaCounts = (chart: OrgChartSections) =>
  new Map<string, number>([
    [STAFF_AREA, countPeople(chart.staff)],
    ...chart.divisions.map((division) => [divisionArea(division.name), countPeople(divisionPeople(division))] as const),
    ...chart.universities.map((campus) => [campusArea(campus.name), countPeople(campus.members)] as const),
  ]);

export const pickOrgAreas = (chart: OrgChartSections, picked: readonly string[]): OrgChartSections =>
  picked.length === 0
    ? chart
    : {
        roleTitles: chart.roleTitles,
        director: null,
        staff: picked.includes(STAFF_AREA) ? chart.staff : [],
        divisions: chart.divisions.filter((division) => picked.includes(divisionArea(division.name))),
        universities: chart.universities.filter((campus) => picked.includes(campusArea(campus.name))),
      };

export const orgPeopleCount = (chart: OrgChartSections) =>
  countPeople([
    chart.director,
    ...chart.staff,
    ...chart.divisions.flatMap(divisionPeople),
    ...chart.universities.flatMap((campus) => campus.members),
  ]);

export const filterOrgChart = (chart: OrgChartSections, focusEmail: string | null, picked: readonly string[]) => {
  const areas = orgAreas(chart);
  const active = picked.filter((key) => areas.some((area) => area.key === key));
  const focused = focusOrgChart(chart, focusEmail);
  const shown = pickOrgAreas(focused, active);
  return { areas, active, counts: orgAreaCounts(focused), shown, people: orgPeopleCount(shown) };
};
