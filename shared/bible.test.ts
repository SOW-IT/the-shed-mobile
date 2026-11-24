import { describe, expect, test } from "vitest";
import {
  BIBLE_BOOKS,
  type BibleBook,
  chooseBook,
  chooseChapter,
  chooseFromVerse,
  chooseToVerse,
  OLD_TESTAMENT_BOOKS,
  type PassagePick,
  parseBibleReference,
  passageFromPick,
  pickFromPassage,
  searchBibleBooks,
  versesInChapter,
} from "./bible";

const book = (name: string): BibleBook => {
  const found = BIBLE_BOOKS.find((b) => b.name === name);
  if (!found) throw new Error(`No book ${name}`);
  return found;
};

const names = (books: readonly BibleBook[]) => books.map((b) => b.name);

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

  test("lists the books in canonical order, 39 Old Testament then 27 New Testament", () => {
    const all = names(BIBLE_BOOKS);
    expect(all.slice(0, 5)).toEqual(["Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy"]);
    expect(all[OLD_TESTAMENT_BOOKS - 1]).toBe("Malachi");
    expect(all[OLD_TESTAMENT_BOOKS]).toBe("Matthew");
    expect(all.length - OLD_TESTAMENT_BOOKS).toBe(27);
    expect(all.at(-1)).toBe("Revelation");
    expect(new Set(all).size).toBe(66);
  });

  test("gives each book its chapter count and every chapter at least one verse", () => {
    const counts: [string, number][] = [
      ["Genesis", 50],
      ["Psalms", 150],
      ["Isaiah", 66],
      ["Jeremiah", 52],
      ["Ezekiel", 48],
      ["Malachi", 4],
      ["Matthew", 28],
      ["Luke", 24],
      ["John", 21],
      ["Acts", 28],
      ["Romans", 16],
      ["Revelation", 22],
    ];
    for (const [name, chapters] of counts) {
      expect(book(name).chapters, name).toHaveLength(chapters);
    }
    expect(names(BIBLE_BOOKS.filter((b) => b.chapters.length === 1))).toEqual([
      "Obadiah",
      "Philemon",
      "2 John",
      "3 John",
      "Jude",
    ]);
    expect(book("Psalms").chapters[118]).toBe(176);
    expect(book("John").chapters[2]).toBe(36);
    for (const b of BIBLE_BOOKS) {
      expect(b.chapters.every((verses) => Number.isInteger(verses) && verses >= 1), b.name).toBe(true);
    }
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

  test("keeps Isaiah apart from 1 Samuel and reads numbered books, dashes and tight spacing", () => {
    const cases: [string, string][] = [
      ["Isa 9:6", "Isaiah 9:6"],
      ["Is 40", "Isaiah 40"],
      ["Isaiah 53", "Isaiah 53"],
      ["I Samuel 3", "1 Samuel 3"],
      ["1Sam 3", "1 Samuel 3"],
      ["II Kings 2", "2 Kings 2"],
      ["III John 4", "3 John 4"],
      ["1st John 1", "1 John 1"],
      ["1 John 3", "1 John 3"],
      ["Song of Songs 2", "Song of Solomon 2"],
      ["Psalm 119:1-176", "Psalm 119:1-176"],
      ["Psalm 119:1\u2013176", "Psalm 119:1-176"],
      ["Psalms 1\u20132", "Psalms 1-2"],
      ["John 3:16\u201418", "John 3:16-18"],
      ["John3:16", "John 3:16"],
    ];
    for (const [raw, formatted] of cases) {
      expect(parseBibleReference(raw), raw).toEqual({ ok: true, formatted });
    }
    expect(parseBibleReference("Psalm 119:1-177").ok).toBe(false);
  });
});

describe("searchBibleBooks", () => {
  test("returns every book in order for an empty query", () => {
    expect(searchBibleBooks("")).toBe(BIBLE_BOOKS);
    expect(searchBibleBooks("   ")).toBe(BIBLE_BOOKS);
  });

  test("matches the start of the name, any word in it, or a short form", () => {
    expect(names(searchBibleBooks("john"))).toEqual(["John", "1 John", "2 John", "3 John"]);
    expect(names(searchBibleBooks("1 jo"))).toEqual(["1 John"]);
    expect(names(searchBibleBooks("ii tim"))).toEqual(["2 Timothy"]);
    expect(names(searchBibleBooks("Ps"))).toEqual(["Psalms"]);
    expect(names(searchBibleBooks("psalm"))).toEqual(["Psalms"]);
    expect(names(searchBibleBooks("phil"))).toEqual(["Philippians", "Philemon"]);
    expect(names(searchBibleBooks("solomon"))).toEqual(["Song of Solomon"]);
    expect(names(searchBibleBooks("rev"))).toEqual(["Revelation"]);
    expect(searchBibleBooks("hezekiah")).toEqual([]);
  });
});

describe("pickFromPassage", () => {
  test("reads nothing from an empty passage", () => {
    expect(pickFromPassage("")).toBeNull();
    expect(pickFromPassage("  ")).toBeNull();
  });

  test("reads a whole chapter, a verse and a verse range", () => {
    expect(pickFromPassage("Psalm 23")).toEqual({ book: book("Psalms"), chapter: 23, fromVerse: null, toVerse: null });
    expect(pickFromPassage("John 3:16")).toEqual({ book: book("John"), chapter: 3, fromVerse: 16, toVerse: null });
    expect(pickFromPassage("John 15:1-17")).toEqual({ book: book("John"), chapter: 15, fromVerse: 1, toVerse: 17 });
    expect(pickFromPassage("1 John 4")).toEqual({ book: book("1 John"), chapter: 4, fromVerse: null, toVerse: null });
  });

  test("reads references typed before the pickers, in any form the parser takes", () => {
    expect(pickFromPassage("jn 3:16")).toEqual({ book: book("John"), chapter: 3, fromVerse: 16, toVerse: null });
    expect(pickFromPassage("Romans 8:28-8:39")).toEqual({
      book: book("Romans"),
      chapter: 8,
      fromVerse: 28,
      toVerse: 39,
    });
    expect(pickFromPassage("Song of Songs 2")).toEqual({
      book: book("Song of Solomon"),
      chapter: 2,
      fromVerse: null,
      toVerse: null,
    });
  });

  test("reads one-chapter books with or without the chapter", () => {
    const jude = book("Jude");
    expect(pickFromPassage("Jude")).toEqual({ book: jude, chapter: 1, fromVerse: null, toVerse: null });
    expect(pickFromPassage("Jude 3")).toEqual({ book: jude, chapter: 1, fromVerse: 3, toVerse: null });
    expect(pickFromPassage("Jude 24-25")).toEqual({ book: jude, chapter: 1, fromVerse: 24, toVerse: 25 });
    expect(pickFromPassage("Philemon 1:4-7")).toEqual({
      book: book("Philemon"),
      chapter: 1,
      fromVerse: 4,
      toVerse: 7,
    });
  });

  test("reads a book still waiting for its chapter", () => {
    expect(pickFromPassage("Joh")).toEqual({ book: book("John"), chapter: null, fromVerse: null, toVerse: null });
    expect(pickFromPassage("John")).toEqual({ book: book("John"), chapter: null, fromVerse: null, toVerse: null });
    expect(pickFromPassage("Psalm")).toEqual({ book: book("Psalms"), chapter: null, fromVerse: null, toVerse: null });
  });

  test("leaves references the pickers can't show as typed text", () => {
    for (const custom of [
      "Genesis 1-3",
      "Psalms 23-24",
      "Romans 8:28-9:5",
      "Psalm 23; John 15:1-17",
      "Jo",
      "John 22",
      "hello",
    ]) {
      expect(pickFromPassage(custom), custom).toBe("custom");
    }
  });
});

describe("passageFromPick", () => {
  const pick = (name: string, chapter: number | null, fromVerse: number | null = null, toVerse: number | null = null) =>
    ({ book: book(name), chapter, fromVerse, toVerse }) satisfies PassagePick;

  test("formats picks the way a typed reference is saved", () => {
    expect(passageFromPick(pick("Psalms", 23))).toBe("Psalm 23");
    expect(passageFromPick(pick("John", 3, 16))).toBe("John 3:16");
    expect(passageFromPick(pick("John", 15, 1, 17))).toBe("John 15:1-17");
    expect(passageFromPick(pick("John", 15, 5, 5))).toBe("John 15:5");
    expect(passageFromPick(pick("John", 15, 5, 3))).toBe("John 15:5");
    expect(passageFromPick(pick("Song of Solomon", 2))).toBe("Song of Solomon 2");
    expect(passageFromPick(pick("Jude", 1))).toBe("Jude");
    expect(passageFromPick(pick("Jude", 1, 24, 25))).toBe("Jude 24-25");
    expect(passageFromPick(pick("Obadiah", 1, 3))).toBe("Obadiah 3");
  });

  test("keeps a book with no chapter yet, so the editor can ask for one", () => {
    expect(passageFromPick(pick("John", null))).toBe("John");
    expect(parseBibleReference("John")).toEqual({ ok: false, error: "Include a chapter for John." });
  });

  test("round-trips every pick through the stored text", () => {
    for (const b of BIBLE_BOOKS) {
      const last = b.chapters.length;
      const verses = b.chapters[last - 1];
      for (const p of [
        chooseBook(b),
        chooseChapter(chooseBook(b), last),
        chooseFromVerse(chooseChapter(chooseBook(b), last), verses),
        chooseToVerse(chooseFromVerse(chooseChapter(chooseBook(b), last), 1), verses),
      ]) {
        expect(pickFromPassage(passageFromPick(p)), passageFromPick(p)).toEqual(p);
      }
    }
  });
});

describe("picker steps", () => {
  const john = book("John");

  test("choosing a book starts over, and a one-chapter book needs no chapter", () => {
    expect(chooseBook(john)).toEqual({ book: john, chapter: null, fromVerse: null, toVerse: null });
    expect(chooseBook(book("Jude"))).toEqual({ book: book("Jude"), chapter: 1, fromVerse: null, toVerse: null });
  });

  test("choosing a chapter clears the verses", () => {
    expect(chooseChapter({ book: john, chapter: 15, fromVerse: 1, toVerse: 17 }, 3)).toEqual({
      book: john,
      chapter: 3,
      fromVerse: null,
      toVerse: null,
    });
  });

  test("choosing a start verse keeps a later end verse and drops an earlier one", () => {
    const range = { book: john, chapter: 15, fromVerse: 1, toVerse: 17 };
    expect(chooseFromVerse(range, 5)).toEqual({ ...range, fromVerse: 5, toVerse: 17 });
    expect(chooseFromVerse(range, 17)).toEqual({ ...range, fromVerse: 17, toVerse: null });
    expect(chooseFromVerse(range, 20)).toEqual({ ...range, fromVerse: 20, toVerse: null });
    expect(chooseFromVerse(range, null)).toEqual({ ...range, fromVerse: null, toVerse: null });
    expect(chooseFromVerse({ ...range, toVerse: null }, 3)).toEqual({ ...range, fromVerse: 3, toVerse: null });
  });

  test("choosing an end verse sets or clears it", () => {
    const start = { book: john, chapter: 15, fromVerse: 1, toVerse: null };
    expect(chooseToVerse(start, 17)).toEqual({ ...start, toVerse: 17 });
    expect(chooseToVerse({ ...start, toVerse: 17 }, null)).toEqual(start);
  });

  test("counts the verses in the chosen chapter", () => {
    expect(versesInChapter({ book: john, chapter: null, fromVerse: null, toVerse: null })).toBe(0);
    expect(versesInChapter({ book: john, chapter: 3, fromVerse: null, toVerse: null })).toBe(36);
    expect(versesInChapter({ book: book("Psalms"), chapter: 119, fromVerse: null, toVerse: null })).toBe(176);
  });
});
