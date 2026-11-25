import { describe, expect, test } from "vitest";
import { boardCards, draftAfterSave } from "./worldNotices";

describe("boardCards", () => {
  test("pinned notices come first, then notifications, each newest first", () => {
    const notices = [
      { id: "n-old", at: 100 },
      { id: "n-new", at: 300 },
    ];
    const notifications = [
      { id: "f-mid", at: 200, read: true },
      { id: "f-newest", at: 900, read: false },
      { id: "f-oldest", at: 50, read: false },
    ];
    const cards = boardCards(notices, notifications);
    expect(cards.map((c) => (c.kind === "notice" ? c.notice.id : c.notification.id))).toEqual([
      "n-new",
      "n-old",
      "f-newest",
      "f-mid",
      "f-oldest",
    ]);
  });

  test("a notification newer than every notice still sits below them, and unread ones aren't moved up", () => {
    const cards = boardCards([{ at: 1 }], [
      { at: 10, read: true },
      { at: 5, read: false },
    ]);
    expect(cards.map((c) => [c.kind, c.at])).toEqual([
      ["notice", 1],
      ["notification", 10],
      ["notification", 5],
    ]);
  });

  test("leaves its inputs alone and copes with an empty board", () => {
    const notices = [{ at: 1 }, { at: 2 }];
    boardCards(notices, []);
    expect(notices).toEqual([{ at: 1 }, { at: 2 }]);
    expect(boardCards([], [])).toEqual([]);
  });
});

describe("after a notice saves", () => {
  test("the editor closes if it still shows what was saved", () => {
    const sent = { id: null, title: "", text: "Bring snacks" };
    expect(draftAfterSave(sent, sent)).toBeNull();
  });

  test("a newer draft, or another notice opened meanwhile, stays open", () => {
    const sent = { id: null, title: "", text: "Bring snacks" };
    const newer = { ...sent, text: "Bring snacks and cups" };
    expect(draftAfterSave(newer, sent)).toBe(newer);
    expect(draftAfterSave(null, sent)).toBeNull();
  });
});
