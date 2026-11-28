import { expect, test } from "vitest";
import { GUIDE } from "./backyardTips";

test("the backyard tips cover planting, watering, growing, harvesting and animals, in that order", () => {
  expect(GUIDE.map((tip) => tip.part)).toEqual(["plant", "water", "grow", "harvest", "animals"]);
});

test("watering leads with the wilt tip, and the numbers come from the farm's own rules", () => {
  const text = (part: string) => GUIDE.find((tip) => tip.part === part)?.text;
  expect(GUIDE.find((tip) => tip.part === "water")?.title).toBe("Water every day so plants don't wilt!");
  expect(text("grow")).toContain("Crops take 1 to 7 days.");
  expect(text("plant")).toContain("Josh in the Garden");
  expect(text("animals")).toContain("Feed chickens grain and cows hay once a day.");
  expect(text("animals")).toContain("eggs or milk");
});
