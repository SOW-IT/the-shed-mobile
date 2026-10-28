import { acronym, HEAD_OF_DEPARTMENT, type RoleTitles } from "./flow";

export type OrgPerson = { email: string; name: string | null; photo: string | null; role: string | null };

export type OrgDepartment = {
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

export type OrgAreaKind = "staff" | "division" | "campus";

export type OrgArea = { key: string; kind: OrgAreaKind; name: string; label: string };

export const STAFF_SECTION = "Staff";
export const CAMPUS_SECTION = "Campus";
export const STAFF_AREA = "staff";

export const divisionArea = (name: string) => `division:${name}`;
export const campusArea = (name: string) => `campus:${name}`;

export const departmentHeadTitle = (titles: RoleTitles) => titles[HEAD_OF_DEPARTMENT] ?? "Head of Dept";

export const orgSearchTerms = (query: string) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const matches = (terms: readonly string[], person: OrgPerson, ...context: string[]) => {
  const text = [person.name, person.email, person.role, ...context].join(" ").toLowerCase();
  return terms.every((term) => text.includes(term));
};

const divisionPeople = (division: OrgDivision) => [
  division.head,
  ...division.departments.flatMap((department) => [department.head, ...department.members]),
];

const countPeople = (people: readonly (OrgPerson | null)[]) =>
  new Set(people.flatMap((person) => (person ? [person.email] : []))).size;

export const searchOrgChart = (chart: OrgChartSections, query: string): OrgChartSections => {
  const terms = orgSearchTerms(query);
  if (terms.length === 0) return chart;
  const found = (person: OrgPerson | null, ...context: string[]) =>
    person && matches(terms, person, ...context) ? person : null;
  const headTitle = departmentHeadTitle(chart.roleTitles);
  return {
    roleTitles: chart.roleTitles,
    director: found(chart.director),
    staff: chart.staff.filter((person) => matches(terms, person, STAFF_SECTION)),
    divisions: chart.divisions
      .map((division) => ({
        ...division,
        head: found(division.head, division.name),
        departments: division.departments
          .map((department) => ({
            ...department,
            head: found(department.head, headTitle, department.name, division.name),
            members: department.members.filter((person) =>
              matches(terms, person, department.name, division.name)
            ),
          }))
          .filter((department) => department.head || department.members.length > 0),
      }))
      .filter((division) => division.head || division.departments.length > 0),
    universities: chart.universities.map((campus) => ({
      ...campus,
      members: campus.members.filter((person) =>
        matches(terms, person, campus.name, acronym(campus.name), CAMPUS_SECTION)
      ),
    })),
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

export const filterOrgChart = (chart: OrgChartSections, query: string, picked: readonly string[]) => {
  const areas = orgAreas(chart);
  const active = picked.filter((key) => areas.some((area) => area.key === key));
  const searched = searchOrgChart(chart, query);
  const shown = pickOrgAreas(searched, active);
  return { areas, active, counts: orgAreaCounts(searched), shown, people: orgPeopleCount(shown) };
};
