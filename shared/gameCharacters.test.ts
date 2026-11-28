import { describe, expect, test } from "vitest";
import {
  characterLook,
  DEFAULT_CHARACTERS,
  isCharacterGame,
  parseCharacters,
  withCharacter,
  type CharacterChoices,
} from "./gameCharacters";
import { NPC, type Look } from "./world";

const MINE: Look = { skin: 2, hair: 3, hairColour: 1, shirt: 4, hat: 2 };

describe("saved character choices", () => {
  test("default to your own character in every game", () => {
    expect(DEFAULT_CHARACTERS).toEqual({ runner: "mine", flappy: "mine", glider: "mine", hop: "mine" });
    expect(parseCharacters("")).toEqual(DEFAULT_CHARACTERS);
  });

  test("read back what was saved for each game", () => {
    const saved = JSON.stringify({ runner: "sij", flappy: "original", glider: "sij", hop: "original" } satisfies CharacterChoices);
    expect(parseCharacters(saved)).toEqual({ runner: "sij", flappy: "original", glider: "sij", hop: "original" });
  });

  test("keep the default for a game with nothing usable saved", () => {
    expect(parseCharacters(JSON.stringify({ runner: "wizard", flappy: 3 }))).toEqual(DEFAULT_CHARACTERS);
    expect(parseCharacters(JSON.stringify({ flappy: "sij" }))).toEqual({ runner: "mine", flappy: "sij", glider: "mine", hop: "mine" });
    // Saved before Swoop had a character: it starts on your own.
    expect(parseCharacters(JSON.stringify({ runner: "sij", flappy: "original" }))).toEqual({
      runner: "sij",
      flappy: "original",
      glider: "mine",
      hop: "mine",
    });
    // Saved before Hop came: Hop starts on your own, and the rest are kept.
    expect(parseCharacters(JSON.stringify({ runner: "original", flappy: "sij", glider: "original" }))).toEqual({
      runner: "original",
      flappy: "sij",
      glider: "original",
      hop: "mine",
    });
    expect(parseCharacters("null")).toEqual(DEFAULT_CHARACTERS);
    expect(parseCharacters("[1,2]")).toEqual(DEFAULT_CHARACTERS);
    expect(parseCharacters("{not json")).toEqual(DEFAULT_CHARACTERS);
  });

  test("a choice for one game leaves the others alone and survives a save and load", () => {
    const next = withCharacter(DEFAULT_CHARACTERS, "flappy", "sij");
    expect(next).toEqual({ runner: "mine", flappy: "sij", glider: "mine", hop: "mine" });
    expect(parseCharacters(JSON.stringify(next))).toEqual(next);
  });

  test("choosing what's already chosen changes nothing", () => {
    expect(withCharacter(DEFAULT_CHARACTERS, "runner", "mine")).toBe(DEFAULT_CHARACTERS);
  });

  test("only Mystic Man, Flap, Swoop and Hop have a character to choose", () => {
    expect(isCharacterGame("runner")).toBe(true);
    expect(isCharacterGame("flappy")).toBe(true);
    expect(isCharacterGame("glider")).toBe(true);
    expect(isCharacterGame("hop")).toBe(true);
    expect(isCharacterGame("shooter")).toBe(false);
  });
});

describe("which character a game draws", () => {
  test("your own World character when you have one", () => {
    expect(characterLook("mine", MINE)).toBe(MINE);
  });

  test("the original when you never made a World character", () => {
    expect(characterLook("mine", null)).toBeNull();
    expect(characterLook("mine", undefined)).toBeNull();
  });

  test("the original when your saved look has a choice this app doesn't know", () => {
    expect(characterLook("mine", { ...MINE, hat: 99 })).toBeNull();
  });

  test("Sij is the Cafe's Sijin, whatever your own look", () => {
    expect(characterLook("sij", MINE)).toBe(NPC.look);
    expect(characterLook("sij", null)).toBe(NPC.look);
  });

  test("the original ignores your look", () => {
    expect(characterLook("original", MINE)).toBeNull();
  });
});
