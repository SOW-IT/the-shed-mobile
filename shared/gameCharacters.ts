import type { GameId } from "./games";
import { isValidLook, NPC, type Look } from "./world";

export const CHARACTER_GAMES = ["runner", "flappy"] as const;
export type CharacterGame = (typeof CHARACTER_GAMES)[number];

export const CHARACTERS = ["mine", "sij", "original"] as const;
export type Character = (typeof CHARACTERS)[number];

export type CharacterChoices = Record<CharacterGame, Character>;

export const DEFAULT_CHARACTERS: CharacterChoices = { runner: "mine", flappy: "mine" };

export const isCharacterGame = (game: GameId): game is CharacterGame =>
  (CHARACTER_GAMES as readonly string[]).includes(game);

const isCharacter = (value: unknown): value is Character =>
  typeof value === "string" && (CHARACTERS as readonly string[]).includes(value);

export const parseCharacters = (saved: string): CharacterChoices => {
  try {
    const parsed: unknown = JSON.parse(saved);
    const record = typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
    const pick = (game: CharacterGame) => {
      const value = record[game];
      return isCharacter(value) ? value : DEFAULT_CHARACTERS[game];
    };
    return { runner: pick("runner"), flappy: pick("flappy") };
  } catch {
    return { ...DEFAULT_CHARACTERS };
  }
};

export const withCharacter = (choices: CharacterChoices, game: CharacterGame, character: Character): CharacterChoices =>
  choices[game] === character ? choices : { ...choices, [game]: character };

export const characterLook = (character: Character, mine: Look | null | undefined): Look | null => {
  if (character === "sij") return NPC.look;
  if (character === "mine" && mine && isValidLook(mine)) return mine;
  return null;
};
