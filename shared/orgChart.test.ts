import { describe, expect, test } from "vitest";
import {
  campusArea,
  departmentHeadTitle,
  divisionArea,
  filterOrgChart,
  isOrgSearchQuery,
  matchesOrgSearch,
  orgAreaCounts,
  orgAreas,
  orgPeopleCount,
  orgSearchIndexWords,
  refinesOrgSearch,
  orgSearchTerms,
  pickOrgAreas,
  focusOrgChart,
  STAFF_AREA,
  staffProfileSearchText,
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

describe("isOrgSearchQuery", () => {
  test("needs two characters after trimming", () => {
    expect(isOrgSearchQuery(" d ")).toBe(false);
    expect(isOrgSearchQuery("da")).toBe(true);
  });
});

describe("staffProfileSearchText", () => {
  test("holds the name, email, roles and teams, with acronyms, once each", () => {
    expect(
      staffProfileSearchText({
        email: "daniel.kim@sow.org.au",
        name: "Daniel Kim",
        assignments: [
          { role: "Head of Department", department: "Finance" },
          { role: "Student Leader", university: "University of New South Wales" },
          { role: "Staff", department: "Finance", division: "Governance" },
        ],
      })
    ).toBe(
      "Daniel Kim daniel.kim@sow.org.au Head of Department HOD Head of Dept Finance Student Leader University of New South Wales UNSW Staff Governance"
    );
  });

  test("adds the other names, the year's role titles and each department's division", () => {
    expect(
      staffProfileSearchText({
        email: "ben.ng@sow.org.au",
        name: "Ben Ng",
        otherNames: ["Benjamin Ng", null, "Ben Ng"],
        titles: { "Head of Department": "Department Overseer", Staff: "Team Member" },
        departmentDivisions: { Finance: "Governance" },
        assignments: [
          { role: "Head of Department", department: "Finance" },
          { role: "Staff", department: "Missions" },
        ],
      })
    ).toBe(
      "Ben Ng Benjamin Ng ben.ng@sow.org.au Head of Department Department Overseer HOD Finance Governance Staff Team Member Missions"
    );
  });

  test("a head of department without a title is also a Head of Dept", () => {
    expect(
      staffProfileSearchText({ email: "a@sow.org.au", assignments: [{ role: "Head of Department", department: "Events" }] })
    ).toBe("a@sow.org.au Head of Department HOD Head of Dept Events");
  });

  test("a profile with no name or roles is just its email", () => {
    expect(staffProfileSearchText({ email: "nora@sow.org.au" })).toBe("nora@sow.org.au");
  });
});

describe("refinesOrgSearch", () => {
  test("results stay while the typed text still starts with what was searched", () => {
    expect(refinesOrgSearch("Dan Ki", "dan")).toBe(true);
    expect(refinesOrgSearch("ma", "john")).toBe(false);
    expect(refinesOrgSearch("joh", "john")).toBe(false);
  });
});

describe("orgSearchIndexWords", () => {
  test("splits on punctuation, drops repeats and keeps the three longest", () => {
    expect(orgSearchIndexWords(["daniel.kim@sow.org.au"])).toEqual(["daniel", "kim", "sow"]);
    expect(orgSearchIndexWords(["dan", "ki", "dan"])).toEqual(["dan", "ki"]);
    expect(orgSearchIndexWords(["--"])).toEqual([]);
  });
});

describe("matchesOrgSearch", () => {
  test("every term has to appear somewhere, ignoring case", () => {
    expect(matchesOrgSearch(["dan", "fin"], "Daniel Kim Staff Finance")).toBe(true);
    expect(matchesOrgSearch(["dan", "unsw"], "Daniel Kim Staff Finance")).toBe(false);
  });
});

describe("focusOrgChart", () => {
  test("no email leaves the chart as it is", () => {
    expect(focusOrgChart(chart, null)).toBe(chart);
  });

  test("keeps only that exact email everywhere it appears, ignoring case", () => {
    const found = focusOrgChart(chart, "AMY.PARK@sow.org.au");
    expect(found.director).toBeNull();
    expect(found.staff).toEqual([]);
    expect(found.divisions.map((d) => d.name)).toEqual(["Governance"]);
    expect(found.divisions[0].head).toBeNull();
    expect(found.divisions[0].departments.map((d) => [d.name, d.head, names(d.members)])).toEqual([
      ["Finance", null, ["Amy Park"]],
    ]);
    expect(found.universities.map((u) => names(u.members))).toEqual([["Amy Park"], []]);
  });

  test("an email that only contains the target doesn't count", () => {
    expect(orgPeopleCount(focusOrgChart(chart, "my.park@sow.org.au"))).toBe(0);
  });

  test("finds heads and the director", () => {
    expect(focusOrgChart(chart, "ben.ng@sow.org.au").divisions[0].departments[0].head?.name).toBe("Ben Ng");
    expect(focusOrgChart(chart, "ruth.cho@sow.org.au").divisions[0].head?.name).toBe("Ruth Cho");
    expect(focusOrgChart(chart, "grace.lim@sow.org.au").director?.name).toBe("Grace Lim");
    expect(names(focusOrgChart(chart, "owen.tran@sow.org.au").staff)).toEqual(["Owen Tran"]);
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
  test("focus and picked areas together, with counts after the focus", () => {
    const result = filterOrgChart(chart, "amy.park@sow.org.au", [campusArea("University of New South Wales")]);
    expect(result.active).toEqual([campusArea("University of New South Wales")]);
    expect(result.counts.get(divisionArea("Governance"))).toBe(1);
    expect(result.counts.get(campusArea("University of New South Wales"))).toBe(1);
    expect(result.shown.divisions).toEqual([]);
    expect(names(result.shown.universities[0].members)).toEqual(["Amy Park"]);
    expect(result.people).toBe(1);
  });

  test("ignores a picked area this year doesn't have", () => {
    const result = filterOrgChart(chart, null, [campusArea("USYD")]);
    expect(result.active).toEqual([]);
    expect(result.shown).toBe(chart);
    expect(result.people).toBe(7);
  });

  test("a picked area keeps its place in the chips when the focus empties it", () => {
    const result = filterOrgChart(chart, "owen.tran@sow.org.au", [divisionArea("Engagement")]);
    expect(result.areas.map((a) => a.name)).toContain("Engagement");
    expect(result.active).toEqual([divisionArea("Engagement")]);
    expect(result.people).toBe(0);
  });
});
