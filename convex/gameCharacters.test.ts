import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import { asUser, newConvex } from "../test/convexFixture";

const ANNA = "anna@sow.org.au";
const BEN = "ben@sow.org.au";
const look = { skin: 3, hair: 6, hairColour: 2, shirt: 4, hat: 1 };

describe("myLook", () => {
  test("is null signed out and for someone who never saved a World character", async () => {
    const t = newConvex();
    expect(await t.query(api.gameCharacters.myLook, {})).toBeNull();
    expect(await asUser(t, ANNA).query(api.gameCharacters.myLook, {})).toBeNull();
  });

  test("is the caller's own saved look, not anyone else's", async () => {
    const t = newConvex();
    const anna = asUser(t, ANNA);
    await anna.mutation(api.world.saveLook, { look });
    expect(await anna.query(api.gameCharacters.myLook, {})).toEqual(look);
    expect(await asUser(t, BEN).query(api.gameCharacters.myLook, {})).toBeNull();
  });
});
