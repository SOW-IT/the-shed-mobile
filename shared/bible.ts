export type BibleBook = {
  readonly name: string;
  readonly singular?: string;
  readonly aliases: readonly string[];
  readonly chapters: readonly number[];
};

export const BIBLE_BOOKS: readonly BibleBook[] = [
  { name: "Genesis", aliases: ["gen", "ge", "gn"], chapters: [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26] },
  { name: "Exodus", aliases: ["exod", "ex", "exo"], chapters: [22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27, 25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29, 31, 43, 38] },
  { name: "Leviticus", aliases: ["lev", "le", "lv"], chapters: [17, 16, 17, 35, 19, 30, 38, 36, 24, 20, 47, 8, 59, 57, 33, 34, 16, 30, 37, 27, 24, 33, 44, 23, 55, 46, 34] },
  { name: "Numbers", aliases: ["num", "nu", "nm", "nb"], chapters: [54, 34, 51, 49, 31, 27, 89, 26, 23, 36, 35, 16, 33, 45, 41, 50, 13, 32, 22, 29, 35, 41, 30, 25, 18, 65, 23, 31, 40, 16, 54, 42, 56, 29, 34, 13] },
  { name: "Deuteronomy", aliases: ["deut", "deu", "dt", "de"], chapters: [46, 37, 29, 49, 33, 25, 26, 20, 29, 22, 32, 32, 18, 29, 23, 22, 20, 22, 21, 20, 23, 30, 25, 22, 19, 19, 26, 68, 29, 20, 30, 52, 29, 12] },
  { name: "Joshua", aliases: ["josh", "jos", "jsh"], chapters: [18, 24, 17, 24, 15, 27, 26, 35, 27, 43, 23, 24, 33, 15, 63, 10, 18, 28, 51, 9, 45, 34, 16, 33] },
  { name: "Judges", aliases: ["judg", "jdg", "jg", "jdgs"], chapters: [36, 23, 31, 24, 31, 40, 25, 35, 57, 18, 40, 15, 25, 20, 20, 31, 13, 31, 30, 48, 25] },
  { name: "Ruth", aliases: ["ruth", "rth", "ru"], chapters: [22, 23, 18, 22] },
  { name: "1 Samuel", aliases: ["1sam", "1sa", "1sm", "1samuel"], chapters: [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 42, 15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13] },
  { name: "2 Samuel", aliases: ["2sam", "2sa", "2sm", "2samuel"], chapters: [27, 32, 39, 12, 25, 23, 29, 18, 13, 19, 27, 31, 39, 33, 37, 23, 29, 33, 43, 26, 22, 51, 39, 25] },
  { name: "1 Kings", aliases: ["1kgs", "1ki", "1kin", "1kings"], chapters: [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43, 29, 53] },
  { name: "2 Kings", aliases: ["2kgs", "2ki", "2kin", "2kings"], chapters: [18, 25, 27, 44, 27, 33, 20, 29, 37, 36, 21, 21, 25, 29, 38, 20, 41, 37, 37, 21, 26, 20, 37, 20, 30] },
  { name: "1 Chronicles", aliases: ["1chr", "1ch", "1chron", "1chronicles"], chapters: [54, 55, 24, 43, 26, 81, 40, 40, 44, 14, 47, 40, 14, 17, 29, 43, 27, 17, 19, 8, 30, 19, 32, 31, 31, 32, 34, 21, 30] },
  { name: "2 Chronicles", aliases: ["2chr", "2ch", "2chron", "2chronicles"], chapters: [17, 18, 17, 22, 14, 42, 22, 18, 31, 19, 23, 16, 22, 15, 19, 14, 19, 34, 11, 37, 20, 12, 21, 27, 28, 23, 9, 27, 36, 27, 21, 33, 25, 33, 27, 23] },
  { name: "Ezra", aliases: ["ezr", "ez"], chapters: [11, 70, 13, 24, 17, 22, 28, 36, 15, 44] },
  { name: "Nehemiah", aliases: ["neh", "ne"], chapters: [11, 20, 32, 23, 19, 19, 73, 18, 38, 39, 36, 47, 31] },
  { name: "Esther", aliases: ["esth", "est", "es"], chapters: [22, 23, 15, 17, 14, 14, 10, 17, 32, 3] },
  { name: "Job", aliases: ["jb"], chapters: [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24, 34, 17] },
  { name: "Psalms", singular: "Psalm", aliases: ["psalm", "ps", "psa", "psm", "pss"], chapters: [6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6] },
  { name: "Proverbs", aliases: ["prov", "pro", "prv", "pr"], chapters: [33, 22, 35, 27, 23, 35, 27, 36, 18, 32, 31, 28, 25, 35, 33, 33, 28, 24, 29, 30, 31, 29, 35, 34, 28, 28, 27, 28, 27, 33, 31] },
  { name: "Ecclesiastes", aliases: ["eccl", "ecc", "eccles", "qoh"], chapters: [18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14] },
  { name: "Song of Solomon", aliases: ["songofsongs", "songs", "song", "sos", "sng", "cant", "canticles"], chapters: [17, 17, 11, 16, 16, 13, 13, 14] },
  { name: "Isaiah", aliases: ["isa", "is"], chapters: [31, 22, 26, 6, 30, 13, 25, 22, 21, 34, 16, 6, 22, 32, 9, 14, 14, 7, 25, 6, 17, 25, 18, 23, 12, 21, 13, 29, 24, 33, 9, 20, 24, 17, 10, 22, 38, 22, 8, 31, 29, 25, 28, 28, 25, 13, 15, 22, 26, 11, 23, 15, 12, 17, 13, 12, 21, 14, 21, 22, 11, 12, 19, 12, 25, 24] },
  { name: "Jeremiah", aliases: ["jer", "je", "jr"], chapters: [19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18, 14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21, 28, 18, 16, 18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34] },
  { name: "Lamentations", aliases: ["lam", "la"], chapters: [22, 22, 66, 22, 22] },
  { name: "Ezekiel", aliases: ["ezek", "eze", "ezk"], chapters: [28, 10, 27, 17, 17, 14, 27, 18, 11, 22, 25, 28, 23, 23, 8, 63, 24, 32, 14, 49, 32, 31, 49, 27, 17, 21, 36, 26, 21, 26, 18, 32, 33, 31, 15, 38, 28, 23, 29, 49, 26, 20, 27, 31, 25, 24, 23, 35] },
  { name: "Daniel", aliases: ["dan", "da", "dn"], chapters: [21, 49, 30, 37, 31, 28, 28, 27, 27, 21, 45, 13] },
  { name: "Hosea", aliases: ["hos", "ho"], chapters: [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9] },
  { name: "Joel", aliases: ["joe", "jl"], chapters: [20, 32, 21] },
  { name: "Amos", aliases: ["am"], chapters: [15, 16, 15, 13, 27, 14, 17, 14, 15] },
  { name: "Obadiah", aliases: ["obad", "ob", "oba"], chapters: [21] },
  { name: "Jonah", aliases: ["jon", "jnh"], chapters: [17, 10, 10, 11] },
  { name: "Micah", aliases: ["mic", "mi"], chapters: [16, 13, 12, 13, 15, 16, 20] },
  { name: "Nahum", aliases: ["nah", "na"], chapters: [15, 13, 19] },
  { name: "Habakkuk", aliases: ["hab", "hb"], chapters: [17, 20, 19] },
  { name: "Zephaniah", aliases: ["zeph", "zep", "zp"], chapters: [18, 15, 20] },
  { name: "Haggai", aliases: ["hag", "hg"], chapters: [15, 23] },
  { name: "Zechariah", aliases: ["zech", "zec", "zc"], chapters: [21, 13, 10, 14, 11, 15, 14, 23, 17, 12, 17, 14, 9, 21] },
  { name: "Malachi", aliases: ["mal", "ml"], chapters: [14, 17, 18, 6] },
  { name: "Matthew", aliases: ["matt", "mat", "mt"], chapters: [25, 23, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35, 30, 34, 46, 46, 39, 51, 46, 75, 66, 20] },
  { name: "Mark", aliases: ["mk", "mrk", "mr"], chapters: [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20] },
  { name: "Luke", aliases: ["lk", "luk", "lu"], chapters: [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47, 38, 71, 56, 53] },
  { name: "John", aliases: ["jn", "jhn", "joh"], chapters: [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31, 25] },
  { name: "Acts", aliases: ["act", "ac"], chapters: [26, 47, 26, 37, 42, 15, 60, 40, 43, 48, 30, 25, 52, 28, 41, 40, 34, 28, 41, 38, 40, 30, 35, 27, 27, 32, 44, 31] },
  { name: "Romans", aliases: ["rom", "ro", "rm"], chapters: [32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27] },
  { name: "1 Corinthians", aliases: ["1cor", "1co", "1corinthians"], chapters: [31, 16, 23, 21, 13, 20, 40, 13, 27, 33, 34, 31, 13, 40, 58, 24] },
  { name: "2 Corinthians", aliases: ["2cor", "2co", "2corinthians"], chapters: [24, 17, 18, 18, 21, 18, 16, 24, 15, 18, 33, 21, 14] },
  { name: "Galatians", aliases: ["gal", "ga"], chapters: [24, 21, 29, 31, 26, 18] },
  { name: "Ephesians", aliases: ["eph", "ep"], chapters: [23, 22, 21, 32, 33, 24] },
  { name: "Philippians", aliases: ["phil", "php", "pp"], chapters: [30, 30, 21, 23] },
  { name: "Colossians", aliases: ["col", "co"], chapters: [29, 23, 25, 18] },
  { name: "1 Thessalonians", aliases: ["1thess", "1th", "1thes", "1thessalonians"], chapters: [10, 20, 13, 18, 28] },
  { name: "2 Thessalonians", aliases: ["2thess", "2th", "2thes", "2thessalonians"], chapters: [12, 17, 18] },
  { name: "1 Timothy", aliases: ["1tim", "1ti", "1tm", "1timothy"], chapters: [20, 15, 16, 16, 25, 21] },
  { name: "2 Timothy", aliases: ["2tim", "2ti", "2tm", "2timothy"], chapters: [18, 26, 17, 22] },
  { name: "Titus", aliases: ["tit", "ti"], chapters: [16, 15, 15] },
  { name: "Philemon", aliases: ["phlm", "phm", "philem"], chapters: [25] },
  { name: "Hebrews", aliases: ["heb", "he"], chapters: [14, 18, 19, 16, 14, 20, 28, 13, 28, 39, 40, 29, 25] },
  { name: "James", aliases: ["jas", "jm", "jam"], chapters: [27, 26, 18, 17, 20] },
  { name: "1 Peter", aliases: ["1pet", "1pe", "1pt", "1peter"], chapters: [25, 25, 22, 19, 14] },
  { name: "2 Peter", aliases: ["2pet", "2pe", "2pt", "2peter"], chapters: [21, 22, 18] },
  { name: "1 John", aliases: ["1jn", "1jo", "1jhn", "1john"], chapters: [10, 29, 24, 21, 21] },
  { name: "2 John", aliases: ["2jn", "2jo", "2jhn", "2john"], chapters: [13] },
  { name: "3 John", aliases: ["3jn", "3jo", "3jhn", "3john"], chapters: [14] },
  { name: "Jude", aliases: ["jud", "jd"], chapters: [25] },
  { name: "Revelation", aliases: ["rev", "re", "rv", "revelations"], chapters: [20, 29, 22, 11, 14, 17, 17, 13, 21, 11, 19, 17, 18, 20, 8, 21, 18, 24, 21, 15, 27, 21] },
];

const normalizeKey = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/^(?:iii\s+|3rd\s*)/, "3")
    .replace(/^(?:ii\s+|2nd\s*)/, "2")
    .replace(/^(?:i\s+|1st\s*)/, "1")
    .replace(/\s+/g, "");

const BOOK_LOOKUP = new Map<string, BibleBook>();
for (const book of BIBLE_BOOKS) {
  BOOK_LOOKUP.set(normalizeKey(book.name), book);
  if (book.singular) BOOK_LOOKUP.set(normalizeKey(book.singular), book);
  for (const alias of book.aliases) {
    if (!BOOK_LOOKUP.has(alias)) BOOK_LOOKUP.set(alias, book);
  }
}

type ParsedBibleRef =
  | { ok: true; formatted: string }
  | { ok: false; error: string };

const parsePositiveInt = (raw: string): number | null => {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
};

const bookDisplay = (book: BibleBook, multiChapter: boolean) =>
  !multiChapter && book.singular ? book.singular : book.name;

const parseOneReference = (raw: string): ParsedBibleRef => {
  const cleaned = raw.trim().replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ");
  if (!cleaned) return { ok: false, error: "Enter a Bible reference." };

  const splitMatch = cleaned.match(/^((?:[123]|I{1,3}|1st|2nd|3rd)?\s*[A-Za-z][A-Za-z.\s]*?)(?:\s*(\d.*))?$/);
  if (!splitMatch) return { ok: false, error: "Enter a valid Bible reference, like Psalm 23 or John 15:1-17." };

  const bookRaw = splitMatch[1].trim();
  const rest = (splitMatch[2] ?? "").trim();
  const book = BOOK_LOOKUP.get(normalizeKey(bookRaw));
  if (!book) return { ok: false, error: `Unknown book "${bookRaw}".` };

  const chapterCount = book.chapters.length;

  if (!rest) {
    if (chapterCount === 1) return { ok: true, formatted: book.name };
    return { ok: false, error: `Include a chapter for ${book.name}.` };
  }

  const singleChapter = chapterCount === 1;

  if (!rest.includes(":")) {
    const parts = rest.split("-").map((s) => s.trim());
    if (parts.length > 2) return { ok: false, error: "Enter a valid chapter or verse range." };
    const start = parsePositiveInt(parts[0]);
    const end = parts.length === 2 ? parsePositiveInt(parts[1]) : start;
    if (start === null || end === null) return { ok: false, error: "Enter valid chapter or verse numbers." };
    if (end < start) return { ok: false, error: "Range end must be after start." };
    if (singleChapter) {
      const maxVerse = book.chapters[0];
      if (start > maxVerse || end > maxVerse) {
        return { ok: false, error: `${book.name} has ${maxVerse} verses.` };
      }
      return {
        ok: true,
        formatted: parts.length === 2 ? `${book.name} ${start}-${end}` : `${book.name} ${start}`,
      };
    }
    if (start > chapterCount || end > chapterCount) {
      return { ok: false, error: `${book.name} has ${chapterCount} chapters.` };
    }
    const label = bookDisplay(book, parts.length === 2 && start !== end);
    return {
      ok: true,
      formatted: parts.length === 2 && start !== end ? `${label} ${start}-${end}` : `${label} ${start}`,
    };
  }

  const rangeParts = rest.split("-").map((s) => s.trim());
  if (rangeParts.length > 2) return { ok: false, error: "Enter a valid passage range." };

  const startMatch = rangeParts[0].match(/^(\d+)\s*:\s*(\d+)$/);
  if (!startMatch) return { ok: false, error: "Use chapter:verse format, like John 15:1-17." };
  const startCh = parsePositiveInt(startMatch[1]);
  const startV = parsePositiveInt(startMatch[2]);
  if (startCh === null || startV === null) return { ok: false, error: "Enter valid chapter and verse numbers." };
  if (startCh > chapterCount) {
    return {
      ok: false,
      error: `${book.name} has ${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}.`,
    };
  }
  const startMaxV = book.chapters[startCh - 1];
  if (startV > startMaxV) {
    return { ok: false, error: `${bookDisplay(book, false)} ${startCh} has ${startMaxV} verses.` };
  }

  if (rangeParts.length === 1) {
    return { ok: true, formatted: `${bookDisplay(book, false)} ${startCh}:${startV}` };
  }

  const endPart = rangeParts[1];
  if (endPart.includes(":")) {
    const endMatch = endPart.match(/^(\d+)\s*:\s*(\d+)$/);
    if (!endMatch) return { ok: false, error: "Use chapter:verse format, like Romans 8:28-9:5." };
    const endCh = parsePositiveInt(endMatch[1]);
    const endV = parsePositiveInt(endMatch[2]);
    if (endCh === null || endV === null) return { ok: false, error: "Enter valid chapter and verse numbers." };
    if (endCh > chapterCount) {
      return {
        ok: false,
        error: `${book.name} has ${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}.`,
      };
    }
    const endMaxV = book.chapters[endCh - 1];
    if (endV > endMaxV) {
      return { ok: false, error: `${bookDisplay(book, false)} ${endCh} has ${endMaxV} verses.` };
    }
    if (endCh < startCh || (endCh === startCh && endV < startV)) {
      return { ok: false, error: "Range end must be after start." };
    }
    if (endCh === startCh) {
      return {
        ok: true,
        formatted: endV === startV ? `${bookDisplay(book, false)} ${startCh}:${startV}` : `${bookDisplay(book, false)} ${startCh}:${startV}-${endV}`,
      };
    }
    return { ok: true, formatted: `${bookDisplay(book, true)} ${startCh}:${startV}-${endCh}:${endV}` };
  }

  const endV = parsePositiveInt(endPart);
  if (endV === null) return { ok: false, error: "Enter a valid ending verse number." };
  if (endV > startMaxV) {
    return { ok: false, error: `${bookDisplay(book, false)} ${startCh} has ${startMaxV} verses.` };
  }
  if (endV < startV) return { ok: false, error: "Range end must be after start." };
  return {
    ok: true,
    formatted: endV === startV ? `${bookDisplay(book, false)} ${startCh}:${startV}` : `${bookDisplay(book, false)} ${startCh}:${startV}-${endV}`,
  };
};

export const parseBibleReference = (raw: string): ParsedBibleRef => {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Enter a Bible reference." };
  const parts = trimmed.split(";").map((part) => part.trim());
  const formatted: string[] = [];
  for (const part of parts) {
    const parsed = parseOneReference(part);
    if (!parsed.ok) return parsed;
    formatted.push(parsed.formatted);
  }
  return { ok: true, formatted: formatted.join("; ") };
};

/** Genesis to Malachi; the New Testament starts at Matthew. */
export const OLD_TESTAMENT_BOOKS = 39;

const findBibleBook = (raw: string): BibleBook | null =>
  BOOK_LOOKUP.get(normalizeKey(raw.trim())) ?? null;

/** Books whose name, a word of the name, or a short form starts with the query, in canonical order. */
export const searchBibleBooks = (query: string): readonly BibleBook[] => {
  const words = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!words) return BIBLE_BOOKS;
  const key = normalizeKey(words);
  return BIBLE_BOOKS.filter(
    (book) =>
      normalizeKey(book.name).startsWith(key) ||
      (book.singular !== undefined && normalizeKey(book.singular).startsWith(key)) ||
      book.name.toLowerCase().split(" ").some((word) => word.startsWith(words)) ||
      book.aliases.some((alias) => alias.startsWith(key))
  );
};

/**
 * One book, one chapter and an optional verse range: what the devotional
 * pickers can show. A one-chapter book (Jude) always has chapter 1.
 */
export type PassagePick = {
  book: BibleBook;
  chapter: number | null;
  fromVerse: number | null;
  toVerse: number | null;
};

const isOneChapter = (book: BibleBook) => book.chapters.length === 1;

/**
 * Reads a stored passage back into the pickers. `null` is an empty passage;
 * "custom" is one the pickers can't show (several passages, a range across
 * chapters, or text that isn't a reference yet), which stays as typed text.
 * A multi-chapter book on its own ("John") is a pick still waiting for a chapter.
 */
export const pickFromPassage = (passage: string): PassagePick | "custom" | null => {
  const trimmed = passage.trim();
  if (!trimmed) return null;
  const parsed = parseBibleReference(trimmed);
  if (!parsed.ok) {
    const book = findBibleBook(trimmed);
    return book ? { book, chapter: null, fromVerse: null, toVerse: null } : "custom";
  }
  const match = parsed.formatted.match(/^(.+?)(?: (\d+)(?::(\d+))?(?:-(\d+))?)?$/);
  const book = match ? findBibleBook(match[1]) : null;
  if (!match || !book) return "custom";
  const [first, verse, last] = [match[2], match[3], match[4]].map((n) =>
    n === undefined ? null : Number(n)
  );
  if (isOneChapter(book)) {
    return verse === null
      ? { book, chapter: 1, fromVerse: first, toVerse: last }
      : { book, chapter: 1, fromVerse: verse, toVerse: last };
  }
  if (first === null) return "custom";
  if (verse === null) {
    return last === null ? { book, chapter: first, fromVerse: null, toVerse: null } : "custom";
  }
  return { book, chapter: first, fromVerse: verse, toVerse: last };
};

/** The stored text for a pick, formatted the same way a typed reference is saved. */
export const passageFromPick = ({ book, chapter, fromVerse, toVerse }: PassagePick): string => {
  let raw = book.name;
  if (isOneChapter(book)) {
    if (fromVerse !== null) raw += ` ${fromVerse}`;
  } else if (chapter !== null) {
    raw += ` ${chapter}`;
    if (fromVerse !== null) raw += `:${fromVerse}`;
  }
  if (fromVerse !== null && toVerse !== null && toVerse > fromVerse) raw += `-${toVerse}`;
  const parsed = parseBibleReference(raw);
  return parsed.ok ? parsed.formatted : raw;
};

export const chooseBook = (book: BibleBook): PassagePick => ({
  book,
  chapter: isOneChapter(book) ? 1 : null,
  fromVerse: null,
  toVerse: null,
});

export const chooseChapter = (pick: PassagePick, chapter: number): PassagePick => ({
  ...pick,
  chapter,
  fromVerse: null,
  toVerse: null,
});

/** `null` means the whole chapter. A later end verse is kept; one at or before the new start is dropped. */
export const chooseFromVerse = (pick: PassagePick, verse: number | null): PassagePick => ({
  ...pick,
  fromVerse: verse,
  toVerse: verse !== null && pick.toVerse !== null && pick.toVerse > verse ? pick.toVerse : null,
});

/** `null` means just the start verse. */
export const chooseToVerse = (pick: PassagePick, verse: number | null): PassagePick => ({
  ...pick,
  toVerse: verse,
});

/** How many verses the pick's chapter has, or 0 before a chapter is chosen. */
export const versesInChapter = (pick: PassagePick): number =>
  pick.chapter === null ? 0 : (pick.book.chapters[pick.chapter - 1] ?? 0);
