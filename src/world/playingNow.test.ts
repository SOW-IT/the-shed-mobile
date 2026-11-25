import { describe, expect, test } from "vitest";
import { playingNow } from "./playingNow";

describe("who in the World is playing what", () => {
  test("others at the arcade, by game, with their names as shown in the World", () => {
    const people = [
      { isMe: false, name: "Kate Ross", away: "arcade" as const, playing: "flappy" },
      { isMe: false, name: "Ben Sun", away: "arcade" as const, playing: "flappy" },
      { isMe: false, name: "Cy Tan", away: "arcade" as const, playing: "glider" },
      { isMe: true, name: "Me Too", away: "arcade" as const, playing: "flappy" },
      { isMe: false, name: "Dee Old", away: "arcade" as const },
      { isMe: false, name: "Eve New", away: "arcade" as const, playing: "chess" },
      { isMe: false, name: "Fay Here", playing: "flappy" },
    ];
    expect(playingNow(people, (name) => name.split(" ")[0])).toEqual({ flappy: ["Kate", "Ben"], glider: ["Cy"] });
    expect(playingNow([], (name) => name)).toEqual({});
  });
});
