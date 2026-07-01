import { describe, expect, test } from "vitest";
import { groupProfiles } from "./useGroupedProfiles";

describe("groupProfiles", () => {
  test("keeps a profile in each matching campus group", () => {
    const grouped = groupProfiles(
      {
        divisions: [],
        departments: [],
        universities: ["Alpha University", "Beta University"],
      } as never,
      [
        {
          email: "leader@example.com",
          name: "Campus Leader",
          assignments: [
            { role: "President", university: "Alpha University" },
            { role: "Executive", university: "Beta University" },
          ],
        },
        {
          email: "member@example.com",
          name: "Campus Member",
          assignments: [{ role: "Student Leader", university: "Beta University" }],
        },
      ] as never
    );

    expect(grouped.campusByUniversity).toEqual([
      {
        university: "Alpha University",
        profiles: [expect.objectContaining({ email: "leader@example.com" })],
      },
      {
        university: "Beta University",
        profiles: [
          expect.objectContaining({ email: "leader@example.com" }),
          expect.objectContaining({ email: "member@example.com" }),
        ],
      },
    ]);
  });
});
