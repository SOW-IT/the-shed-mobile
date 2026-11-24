import { describe, expect, test } from "vitest";
import { BIBLE_BOOKS, parseBibleReference } from "./bible";

describe("Protestant canon metadata", () => {
  test("contains all 66 books, 1189 chapters and 31102 verses", () => {
    expect(BIBLE_BOOKS).toHaveLength(66);
    const totalChapters = BIBLE_BOOKS.reduce((sum, book) => sum + book.chapters.length, 0);
    const totalVerses = BIBLE_BOOKS.reduce(
      (sum, book) => sum + book.chapters.reduce((a, b) => a + b, 0),
      0
    );
    expect(totalChapters).toBe(1189);
    expect(totalVerses).toBe(31102);
  });
});

describe("parseBibleReference", () => {
  test("parses and formats whole chapters and chapter ranges", () => {
    expect(parseBibleReference("Psalm 23")).toEqual({ ok: true, formatted: "Psalm 23" });
    expect(parseBibleReference("psalms 23")).toEqual({ ok: true, formatted: "Psalm 23" });
    expect(parseBibleReference("ps. 23-24")).toEqual({ ok: true, formatted: "Psalms 23-24" });
    expect(parseBibleReference("Psalms 23-23")).toEqual({ ok: true, formatted: "Psalm 23" });
    expect(parseBibleReference("Gen 1")).toEqual({ ok: true, formatted: "Genesis 1" });
    expect(parseBibleReference("Genesis 1–3")).toEqual({ ok: true, formatted: "Genesis 1-3" });
    expect(parseBibleReference("1 cor 13")).toEqual({ ok: true, formatted: "1 Corinthians 13" });
    expect(parseBibleReference("II Tim 3")).toEqual({ ok: true, formatted: "2 Timothy 3" });
    expect(parseBibleReference("3rd John 1:4")).toEqual({ ok: true, formatted: "3 John 1:4" });
    expect(parseBibleReference("Song of Songs 2")).toEqual({ ok: true, formatted: "Song of Solomon 2" });
  });

  test("parses and formats verse references and ranges", () => {
    expect(parseBibleReference("John 3:16")).toEqual({ ok: true, formatted: "John 3:16" });
    expect(parseBibleReference("john 15:1-17")).toEqual({ ok: true, formatted: "John 15:1-17" });
    expect(parseBibleReference("John 15:5-5")).toEqual({ ok: true, formatted: "John 15:5" });
    expect(parseBibleReference("Rom 8:28-9:5")).toEqual({ ok: true, formatted: "Romans 8:28-9:5" });
    expect(parseBibleReference("Romans 8:28-8:39")).toEqual({ ok: true, formatted: "Romans 8:28-39" });
    expect(parseBibleReference("Romans 8:28-8:28")).toEqual({ ok: true, formatted: "Romans 8:28" });
    expect(parseBibleReference("Ps 119:176")).toEqual({ ok: true, formatted: "Psalm 119:176" });
    expect(parseBibleReference("Psalm 23; John 15:1-17")).toEqual({
      ok: true,
      formatted: "Psalm 23; John 15:1-17",
    });
  });

  test("handles single-chapter books", () => {
    expect(parseBibleReference("Jude")).toEqual({ ok: true, formatted: "Jude" });
    expect(parseBibleReference("Jude 24-25")).toEqual({ ok: true, formatted: "Jude 24-25" });
    expect(parseBibleReference("Jude 3")).toEqual({ ok: true, formatted: "Jude 3" });
    expect(parseBibleReference("Philemon 1:4-7")).toEqual({ ok: true, formatted: "Philemon 1:4-7" });
    expect(parseBibleReference("Obadiah 21")).toEqual({ ok: true, formatted: "Obadiah 21" });
    expect(parseBibleReference("Jude 26").ok).toBe(false);
    expect(parseBibleReference("Jude 2:1").ok).toBe(false);
  });

  test("rejects invalid references, chapters, verses and ranges", () => {
    for (const bad of [
      "",
      "   ",
      "123",
      "Hezekiah 1:1",
      "Genesis",
      "Genesis 0",
      "Genesis 51",
      "Genesis 1-51",
      "Genesis 5-2",
      "Genesis 1-2-3",
      "Genesis 1a",
      "John 3:0",
      "John 3:37",
      "John 22:1",
      "John 15:17-1",
      "John 15:1-28",
      "John 15:1-15:0",
      "John 15:1-22:1",
      "John 15:1-16:34",
      "John 15:10-14:5",
      "John 15:10-15:5",
      "John 15:1-2-3",
      "John 15:abc",
      "John 15:1-abc",
      "John 15:1-16:abc",
      "John :1",
      "Psalm 23; ",
    ]) {
      expect(parseBibleReference(bad).ok, bad).toBe(false);
    }
  });
});
