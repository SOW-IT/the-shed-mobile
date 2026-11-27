import { expect, test } from "vitest";
import { FARMER, NPC } from "../../shared/world";
import { FARM_OFFERS_FROM, KEEPERS, SHOP_TABS } from "./shopTabs";

test("Sijin sells furniture and wallpaper only, and Josh everything for the farm, animals too", () => {
  expect(SHOP_TABS.sijin.map((tab) => tab.id)).toEqual(["furniture", "wallpaper"]);
  expect(SHOP_TABS.josh.map((tab) => tab.id)).toEqual(["seeds", "animals", "sell"]);
  expect(KEEPERS.sijin).toBe(NPC);
  expect(KEEPERS.josh.name).toBe("Josh Kim");
});

test("plot, coop and barn offers come from Josh, in the Garden", () => {
  expect(FARM_OFFERS_FROM).toBe(FARMER);
  expect(FARMER.place).toBe("garden");
});
