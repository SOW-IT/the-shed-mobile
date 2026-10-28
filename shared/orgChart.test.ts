import { describe, expect, test } from "vitest";
import {
  campusArea,
  departmentHeadTitle,
  divisionArea,
  filterOrgChart,
  orgAreaCounts,
  orgAreas,
  orgPeopleCount,
  orgSearchTerms,
  pickOrgAreas,
  searchOrgChart,
  STAFF_AREA,
  type OrgChartSections,
  type OrgPerson,
} from "./orgChart";

const person = (name: string, role: string | null = null): OrgPerson => ({
  email: `${name.toLowerCase().replace(/ /g, ".")}@sow.org.au`,
  name,
  photo: null,
  role,
});

const chart: OrgChartSections = {
  roleTitles: {},
  director: person("Grace Lim", "Director"),
  staff: [person("Owen Tran", "Staff")],
  divisions: [
    {
      name: "Governance",
      head: person("Ruth Cho", "Head of Division"),
      departments: [
        {
          name: "Finance",
          colour: null,
          head: person("Ben Ng"),
          members: [person("Amy Park", "Staff"), person("Ruth Cho", "Staff")],
        },
        { name: "Compliance", colour: "#123456", head: null, members: [] },
      ],
    },
    {
      name: "Engagement",
      head: null,
      departments: [{ name: "Marketing", colour: null, head: null, members: [person("Eli Wong", "Staff")] }],
    },
    { name: "Empty", head: null, departments: [{ name: "Alumni", colour: null, head: null, members: [] }] },
  ],
  universities: [
    {
      name: "University of New South Wales",
      members: [person("Hana Kim", "Campus Leader"), person("Amy Park", "Campus Leader")],
    },
    { name: "UTS", members: [] },
  ],
};

const names = (people: readonly (OrgPerson | null)[]) => people.map((p) => p?.name ?? null);

describe("departmentHeadTitle", () => {
  test("uses the year's title for Head of Department, or a short default", () => {
    expect(departmentHeadTitle({})).toBe("Head of Dept");
    expect(departmentHeadTitle({ "Head of Department": "Department Overseer" })).toBe("Department Overseer");
  });
});

describe("orgSearchTerms", () => {
  test("lower-cases and splits on whitespace, ignoring blanks", () => {
    expect(orgSearchTerms("  Amy   PARK ")).toEqual(["amy", "park"]);
    expect(orgSearchTerms("   ")).toEqual([]);
  });
});

describe("searchOrgChart", () => {
  test("an empty search leaves the chart as it is", () => {
    expect(searchOrgChart(chart, " ")).toBe(chart);
  });

  test("matches a name in any section and drops cards with no one left", () => {
    const found = searchOrgChart(chart, "amy");
    expect(found.director).toBeNull();
    expect(found.staff).toEqual([]);
    expect(found.divisions.map((d) => d.name)).toEqual(["Governance"]);
    expect(found.divisions[0].head).toBeNull();
    expect(found.divisions[0].departments.map((d) => d.name)).toEqual(["Finance"]);
    expect(names(found.divisions[0].departments[0].members)).toEqual(["Amy Park"]);
    expect(names(found.universities.flatMap((u) => u.members))).toEqual(["Amy Park"]);
  });

  test("every word has to match, across the person and where they sit", () => {
    const found = searchOrgChart(chart, "unsw leader hana");
    expect(names(found.universities[0].members)).toEqual(["Hana Kim"]);
    expect(found.divisions).toEqual([]);
  });

  test("a team's name finds everyone in it, the head included", () => {
    const found = searchOrgChart(chart, "finance");
    expect(found.divisions[0].head).toBeNull();
    expect(found.divisions[0].departments[0].head?.name).toBe("Ben Ng");
    expect(names(found.divisions[0].departments[0].members)).toEqual(["Amy Park", "Ruth Cho"]);
  });

  test("a division's name finds its head and departments", () => {
    const found = searchOrgChart(chart, "governance");
    expect(found.divisions[0].head?.name).toBe("Ruth Cho");
    expect(found.divisions[0].departments.map((d) => d.name)).toEqual(["Finance"]);
  });

  test("a department head matches on the year's title for the role", () => {
    const titled = { ...chart, roleTitles: { "Head of Department": "Department Overseer" } };
    expect(searchOrgChart(titled, "overseer").divisions[0].departments[0].head?.name).toBe("Ben Ng");
    expect(searchOrgChart(chart, "head of dept").divisions[0].departments[0].head?.name).toBe("Ben Ng");
  });

  test("a campus matches on its full name or its short one", () => {
    expect(names(searchOrgChart(chart, "unsw hana").universities[0].members)).toEqual(["Hana Kim"]);
    expect(names(searchOrgChart(chart, "new south wales").universities[0].members)).toEqual(["Hana Kim", "Amy Park"]);
  });

  test("the section names Staff and Campus match the people under them", () => {
    expect(names(searchOrgChart(chart, "owen staff").staff)).toEqual(["Owen Tran"]);
    expect(names(searchOrgChart(chart, "campus").universities[0].members)).toEqual(["Hana Kim", "Amy Park"]);
  });

  test("matches the Director by role, and by email", () => {
    expect(searchOrgChart(chart, "director").director?.name).toBe("Grace Lim");
    expect(searchOrgChart(chart, "grace.lim@").director?.name).toBe("Grace Lim");
  });

  test("keeps a division whose head matches though none of its departments do", () => {
    const found = searchOrgChart(chart, "ruth head");
    expect(found.divisions.map((d) => d.name)).toEqual(["Governance"]);
    expect(found.divisions[0].head?.name).toBe("Ruth Cho");
    expect(found.divisions[0].departments).toEqual([]);
  });
});

describe("orgAreas", () => {
  test("Staff, then divisions with anyone in them, then campuses with anyone in them", () => {
    expect(orgAreas(chart)).toEqual([
      { key: STAFF_AREA, kind: "staff", name: "Staff", label: "Staff" },
      { key: divisionArea("Governance"), kind: "division", name: "Governance", label: "Governance" },
      { key: divisionArea("Engagement"), kind: "division", name: "Engagement", label: "Engagement" },
      {
        key: campusArea("University of New South Wales"),
        kind: "campus",
        name: "University of New South Wales",
        label: "UNSW",
      },
    ]);
  });

  test("no Staff area when the year has no general staff", () => {
    expect(orgAreas({ ...chart, staff: [] }).map((a) => a.kind)).not.toContain("staff");
  });
});

describe("orgAreaCounts", () => {
  test("counts each person once per area", () => {
    const counts = orgAreaCounts(chart);
    expect(counts.get(STAFF_AREA)).toBe(1);
    expect(counts.get(divisionArea("Governance"))).toBe(3);
    expect(counts.get(divisionArea("Engagement"))).toBe(1);
    expect(counts.get(campusArea("University of New South Wales"))).toBe(2);
    expect(counts.get(campusArea("UTS"))).toBe(0);
  });
});

describe("pickOrgAreas", () => {
  test("nothing picked leaves the chart as it is", () => {
    expect(pickOrgAreas(chart, [])).toBe(chart);
  });

  test("shows only the picked sections, without the Director", () => {
    const picked = pickOrgAreas(chart, [divisionArea("Engagement"), campusArea("University of New South Wales")]);
    expect(picked.director).toBeNull();
    expect(picked.staff).toEqual([]);
    expect(picked.divisions.map((d) => d.name)).toEqual(["Engagement"]);
    expect(picked.universities.map((u) => u.name)).toEqual(["University of New South Wales"]);
  });

  test("Staff can be picked on its own", () => {
    const picked = pickOrgAreas(chart, [STAFF_AREA]);
    expect(names(picked.staff)).toEqual(["Owen Tran"]);
    expect(picked.divisions).toEqual([]);
    expect(picked.universities).toEqual([]);
  });
});

describe("orgPeopleCount", () => {
  test("counts someone in several places once", () => {
    expect(orgPeopleCount(chart)).toBe(7);
  });
});

describe("filterOrgChart", () => {
  test("search and picked areas together, with counts after the search", () => {
    const result = filterOrgChart(chart, "amy", [campusArea("University of New South Wales")]);
    expect(result.active).toEqual([campusArea("University of New South Wales")]);
    expect(result.counts.get(divisionArea("Governance"))).toBe(1);
    expect(result.counts.get(campusArea("University of New South Wales"))).toBe(1);
    expect(result.shown.divisions).toEqual([]);
    expect(names(result.shown.universities[0].members)).toEqual(["Amy Park"]);
    expect(result.people).toBe(1);
  });

  test("ignores a picked area this year doesn't have", () => {
    const result = filterOrgChart(chart, "", [campusArea("USYD")]);
    expect(result.active).toEqual([]);
    expect(result.shown).toBe(chart);
    expect(result.people).toBe(7);
  });

  test("a picked area keeps its place in the chips when the search empties it", () => {
    const result = filterOrgChart(chart, "owen", [divisionArea("Engagement")]);
    expect(result.areas.map((a) => a.name)).toContain("Engagement");
    expect(result.active).toEqual([divisionArea("Engagement")]);
    expect(result.people).toBe(0);
  });
});
