import { describe, expect, test } from "vitest";
import { HATS, HAIR_STYLES, LOOK_SIZES, NPC, randomLook, type Look } from "../../shared/world";
import { backdropOf, BUST_BORDER, bustFigure } from "./bust";
import { people } from "./palette";

const plain: Look = { skin: 0, hair: 0, hairColour: 0, shirt: 0 };

describe("the round avatar", () => {
  test("is centred in its circle, border included, for every height, build, hat and hair, and Sijin", () => {
    const looks: Look[] = [plain, NPC.look];
    for (let height = 0; height < LOOK_SIZES.height; height++) for (let build = 0; build < LOOK_SIZES.build; build++) looks.push({ ...plain, height, build });
    HATS.forEach((_, hat) => looks.push({ ...plain, hat }));
    HAIR_STYLES.forEach((_, hair) => looks.push({ ...plain, hair }));
    for (const size of [36, 40, 64]) {
      for (const look of looks) expect(bustFigure(look, size).foot.x + BUST_BORDER).toBe(size / 2);
    }
  });

  test("a taller look stands lower so its head stays in the circle", () => {
    expect(bustFigure({ ...plain, height: 4 }, 40).foot.y).toBeGreaterThan(bustFigure({ ...plain, height: 0 }, 40).foot.y);
  });

  test("its background is the one they chose, and today's mint until they choose", () => {
    expect(backdropOf(plain)).toBe(people.backdrops[0]);
    expect(backdropOf({ ...plain, backdrop: 3 })).toBe(people.backdrops[3]);
    expect(backdropOf({ ...plain, backdrop: 99 })).toBe(people.backdrops[0]);
    const look = randomLook(() => 0.999);
    expect(backdropOf(look)).toBe(people.backdrops[LOOK_SIZES.backdrop - 1]);
  });
});
