import { describe, expect, test } from "vitest";
import { DUEL_REVEAL_MS, EMOTE_MS } from "../../shared/world";
import { choosing, duelFor, duelLookFor, type DuelView } from "./duel";

const live: DuelView = { id: "d1", a: "ann", b: "ben", round: 1, startsAt: 0, endsAt: 5000, done: false };
const won: DuelView = { ...live, done: true, shown: { a: "paper", b: "rock", at: 5000, winner: "a" } };

describe("what a duel shows over each player", () => {
  test("both chant during the countdown, and nobody else is in it", () => {
    expect(duelLookFor([live], "ann", 1000)).toEqual({ opponent: "ben", chant: null, pickIcon: null, result: null });
    expect(duelLookFor([live], "ben", 2700)?.chant).toBe("Scissors…");
    expect(duelLookFor([live], "ann", 4000)?.chant).toBe("Paper…");
    expect(duelLookFor([live], "cara", 4000)).toBeNull();
  });

  test("on Rock! the picks show, then the winner cheers and the loser cries", () => {
    expect(duelLookFor([won], "ann", 5000)).toEqual({ opponent: "ben", chant: "Rock!", pickIcon: "✋", result: null });
    expect(duelLookFor([won], "ben", 5100)?.pickIcon).toBe("✊");
    const after = 5000 + DUEL_REVEAL_MS + EMOTE_MS / 2;
    expect(duelLookFor([won], "ann", after)).toMatchObject({ chant: null, pickIcon: null, result: { emote: "cheer", p: 0.5 } });
    expect(duelLookFor([won], "ben", after)?.result?.emote).toBe("cry");
    expect(duelLookFor([won], "ann", 5000 + DUEL_REVEAL_MS + EMOTE_MS)).toBeNull();
  });

  test("a draw shows both picks, then the next round's chant", () => {
    const again: DuelView = {
      ...live,
      round: 2,
      startsAt: 5000 + DUEL_REVEAL_MS,
      endsAt: 5000 + DUEL_REVEAL_MS + 3000,
      shown: { a: "rock", b: "rock", at: 5000, winner: "draw" },
    };
    expect(duelLookFor([again], "ann", 5100)).toMatchObject({ pickIcon: "✊", chant: "Rock!", result: null });
    expect(duelLookFor([again], "ann", again.endsAt - 100)).toMatchObject({ pickIcon: null, chant: "Paper…" });
    expect(choosing(again, 5100)).toBe(false);
    expect(choosing(again, again.startsAt)).toBe(true);
    expect(choosing(again, again.endsAt)).toBe(false);
  });

  test("a drawn last round ends with no winner or loser", () => {
    const tied: DuelView = { ...live, done: true, shown: { a: "rock", b: "rock", at: 5000, winner: "draw" } };
    expect(duelLookFor([tied], "ann", 5000 + DUEL_REVEAL_MS + 10)?.result).toBeNull();
  });

  test("an old finished duel doesn't hide a new one", () => {
    const fresh: DuelView = { ...live, id: "d2", startsAt: 20_000, endsAt: 25_000 };
    expect(duelFor([won, fresh], "ann", 21_000)?.id).toBe("d2");
    expect(choosing(null, 0)).toBe(false);
  });
});
