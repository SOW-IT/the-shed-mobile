import { describe, expect, it } from "vitest";
import { lobbyChatLines, tableChatLog, worldChatLog } from "./chatLogSize";

describe("the chat log's size", () => {
  it("keeps the phone sizes on phones up to an iPhone 17 Pro", () => {
    for (const [w, h] of [[375, 667], [402, 874]]) {
      expect(worldChatLog(w, h)).toEqual({ lines: 7, maxWidth: 460, text: 1 });
      expect(tableChatLog(w, h).lines).toBe(3);
    }
  });

  it("grows taller, wider and a little bigger on bigger screens, more on bigger ones", () => {
    const big = worldChatLog(440, 956);
    const web = worldChatLog(1280, 800);
    const huge = worldChatLog(1920, 1080);
    expect(big.lines).toBeGreaterThanOrEqual(7);
    expect(web.lines).toBeGreaterThan(7);
    expect(huge.lines).toBeGreaterThan(web.lines);
    expect(web.maxWidth).toBeGreaterThan(460);
    expect(web.text).toBeGreaterThan(1);
    expect(huge.maxWidth).toBeLessThan(1920 / 2);
  });

  it("gives up lines while the mahjong lobby is open under it, more on a short screen", () => {
    expect(lobbyChatLines(375, 667)).toBe(3);
    expect(lobbyChatLines(402, 874)).toBe(5);
    expect(lobbyChatLines(1920, 1080)).toBeLessThanOrEqual(worldChatLog(1920, 1080).lines);
    for (const [w, h] of [[375, 667], [402, 874], [1280, 800]]) expect(lobbyChatLines(w, h)).toBeLessThanOrEqual(worldChatLog(w, h).lines);
  });

  it("stays shorter at the mahjong table than in the World, and only grows there on a tall window", () => {
    for (const [w, h] of [[402, 874], [1280, 800], [1920, 1080], [1024, 1366]]) expect(tableChatLog(w, h).lines).toBeLessThan(worldChatLog(w, h).lines);
    expect(tableChatLog(1280, 800).lines).toBe(3);
    expect(tableChatLog(1920, 1080).lines).toBeGreaterThan(3);
    expect(tableChatLog(1280, 800).text).toBeGreaterThan(1);
  });
});
