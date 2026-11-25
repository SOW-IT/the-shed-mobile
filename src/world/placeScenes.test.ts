import { expect, test } from "vitest";
import { makeCamera } from "./camera";
import { itemAt } from "./gardenScene";
import { buildScene } from "./placeScenes";

const cam = makeCamera(390, 844, { x: 0, z: -2.6 });

test("a placed rug can be tapped to select it, and what stands on it is tapped first", () => {
  const scene = buildScene("home", cam, {
    wallpaper: "plain",
    items: [
      { key: "r", item: "rug", x: 0, z: -2, turn: 0 },
      { key: "t", item: "table", x: 0, z: -2, turn: 0 },
    ],
  });
  const rug = scene.props.find((prop) => prop.tap === "item:r")!;
  expect(rug.prims).toEqual([]);
  const middle = cam.project([0, 0, -2]);
  expect(itemAt(scene.props, middle.x, middle.y)).toBe("t");
  const edge = cam.project([1.1, 0, -1.4]);
  expect(itemAt(scene.props, edge.x, edge.y)).toBe("r");
});

test("a rug on its own is still drawn on the floor", () => {
  const bare = buildScene("home", cam, { wallpaper: "plain", items: [] });
  const withRug = buildScene("home", cam, { wallpaper: "plain", items: [{ key: "r", item: "rug", x: 0, z: -2, turn: 0 }] });
  expect(withRug.ground.length).toBeGreaterThan(bare.ground.length);
  expect(itemAt(withRug.props, cam.project([0, 0, -2]).x, cam.project([0, 0, -2]).y)).toBe("r");
});

test("a backyard fences off the plots that aren't bought yet", () => {
  const fences = (plots: number) => buildScene("backyard", cam, undefined, { plots, coop: false, barn: false }).props.filter((prop) => prop.id.startsWith("fence-")).map((prop) => prop.id);
  expect(fences(4)).toHaveLength(8);
  expect(fences(6)).toEqual(["fence-6", "fence-7", "fence-8", "fence-9", "fence-10", "fence-11"]);
  expect(fences(12)).toEqual([]);
});

test("a backyard shows a building and its pen once bought, and a fenced patch before", () => {
  const ids = (coop: boolean, barn: boolean) => buildScene("backyard", cam, undefined, { plots: 4, coop, barn }).props.map((prop) => prop.id).filter((id) => /house|pen/.test(id));
  expect(ids(false, false)).toEqual(["penfront-coop", "penfront-barn"]);
  expect(ids(true, false)).toEqual(["house-coop", "penback-coop", "penfront-coop", "penfront-barn"]);
  expect(ids(true, true)).toHaveLength(6);
});
