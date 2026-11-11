import { vi } from "vitest";
import { sydneyToday, type DesignAnswers } from "../shared/designRequests";
import type { Assignment } from "../shared/flow";
import { sydneyDateTimeAnswer, type FormAnswers } from "../shared/forms";
import { api } from "../convex/_generated/api";
import { ADMIN, DAY, PINNED_NOW, YEAR, asUser, seeded, type T } from "./convexFixture";

export const HENRY = "henry@sow.org.au";
export const MARY = "mary@sow.org.au";
export const RACHEL = "rachel@sow.org.au";
export const EDDIE = "eddie@sow.org.au";
export const CORA = "cora@sow.org.au";
export const FIONA = "fiona@sow.org.au";
export const BELLA = "bella@sow.org.au";
export const DAN = "dan@sow.org.au";

export type Person = [string, Assignment[]];

export const at = (days: number, hour = 18) =>
  sydneyDateTimeAnswer(PINNED_NOW + days * DAY).slice(0, 11) + `${String(hour).padStart(2, "0")}:00`;

export const atDay = (days: number) => vi.setSystemTime(PINNED_NOW + days * DAY);

export const seedStaff = (t: T, people: Person[], heads: Record<string, string | undefined>, year = YEAR) =>
  t.run(async (ctx) => {
    for (const [email, assignments] of people) {
      await ctx.db.insert("staffProfiles", { email, year, assignments });
    }
    for (const department of await ctx.db.query("departments").collect()) {
      if (department.name in heads) {
        await ctx.db.patch("departments", department._id, { headEmail: heads[department.name] });
      }
    }
  });

export const FLOW_PEOPLE: Person[] = [
  [HENRY, [{ role: "Head of Department", department: "Marketing" }]],
  [MARY, [{ role: "Staff", department: "Marketing" }]],
  [RACHEL, [{ role: "Staff", department: "Events" }]],
  [EDDIE, [{ role: "Head of Department", department: "Events" }]],
  [CORA, [{ role: "Head of Department", department: "Compliance" }]],
  [FIONA, [{ role: "Head of Department", department: "Finance" }]],
  [BELLA, [{ role: "Staff", department: "Finance" }]],
];

export const FLOW_HEADS = { Marketing: HENRY, Events: EDDIE, Compliance: CORA, Finance: FIONA };

export async function flowSetup(extra: Person[] = []) {
  const t = await seeded();
  await seedStaff(t, [...FLOW_PEOPLE, ...extra], FLOW_HEADS);
  await asUser(t, ADMIN).mutation(api.admin.setBudgetManager, { year: YEAR, email: BELLA });
  return t;
}

export const designAnswers = (over: DesignAnswers = {}): DesignAnswers => ({
  department: "Events",
  types: ["promotion"],
  details: "Hoodies",
  items: ["poster"],
  visualStyle: "Earthy",
  keyMessage: "Come along",
  promoBudget: 100,
  dueDate: sydneyToday(new Date(PINNED_NOW + 14 * DAY)),
  multipleDrafts: false,
  runByYou: true,
  ...over,
});

export const eventAnswers = (over: FormAnswers = {}): FormAnswers => ({
  name: "Winter Camp",
  department: "Events",
  purpose: "Retreat",
  goals: "Rest",
  location: "Camp site",
  registrationGoal: 40,
  audience: "all",
  start: at(40, 9),
  end: at(40, 17),
  ...over,
});

export const RISK = {
  noRisks: false,
  risks: [{ description: "Rain", category: "safety" as const, consequence: 2, likelihood: 3, mitigation: "Tents" }],
};
