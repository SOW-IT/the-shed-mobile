#!/usr/bin/env node
// Builds a day of two passages from the lists (Genesis 1-3 and Psalm 1),
// saves it, opens it again, runs Genesis on into Exodus, checks a change over the 120-character limit is
// refused, and checks a saved one-chapter day still shows one row the way it
// did before.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-passage-multi";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const expectText = async (testId, want, what) => {
  const got = (await page.getByTestId(testId).innerText()).trim();
  if (got !== want) failures.push(`${what}: wanted ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const expectCount = async (testId, want, what) => {
  const got = await page.getByTestId(testId).count();
  if (got !== want) failures.push(`${what}: wanted ${want} of ${testId}, got ${got}`);
};
const sheetClosed = () => page.getByTestId("sheet-list").waitFor({ state: "hidden" });
const chooseBook = async (rowTestId, search, name) => {
  await page.getByTestId(rowTestId).click();
  await page.getByPlaceholder("Search books").fill(search);
  await page.getByRole("radio", { name: new RegExp(`^${name}`) }).click();
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));

  await page.goto(`${BASE}/devotionals/${seed.devotionalEmptyDate}`);
  await page.getByTestId("devotional-passage-book").waitFor();
  await expectCount("devotional-passage-add", 0, "an empty day");

  // Genesis 1, then To → chapter 3.
  await chooseBook("devotional-passage-book", "Gen", "Genesis");
  await page.getByTestId("passage-chapter-1").click();
  await sheetClosed();
  await page.getByTestId("devotional-passage-to-chapter").click();
  await page.getByText("Genesis 1: last chapter").waitFor();
  await page.screenshot({ path: `${OUT}/multi-last-chapter-sheet.png` });
  await page.getByTestId("passage-chapter-3").click();
  await sheetClosed();
  await expectText("devotional-passage-display", "Genesis 1-3", "a run of chapters");

  // Another passage, from another book.
  await chooseBook("devotional-passage-add", "Psal", "Psalms");
  await page.getByTestId("passage-chapter-1").click();
  await sheetClosed();
  await expectText("devotional-passage-display", "Genesis 1-3\nPsalm 1", "two books on one day");
  await expectCount("devotional-passage-book-2", 1, "the second row");
  await page.screenshot({ path: `${OUT}/multi-two-passages.png`, fullPage: true });

  // Back saves it.
  await page.getByTestId("devotional-back").click();
  await page.getByTestId("devotional-passage-book").waitFor({ state: "detached" });

  // Opening the day again reads both rows back.
  await page.goto(`${BASE}/devotionals/${seed.devotionalEmptyDate}`);
  await page.getByTestId("devotional-passage-book-2").waitFor();
  await expectText("devotional-passage-display", "Genesis 1-3\nPsalm 1", "the saved day");
  const to = await page.getByTestId("devotional-passage-to-chapter").getAttribute("aria-label");
  if (to !== "To chapter, 3") failures.push(`the saved run of chapters: To reads ${JSON.stringify(to)}`);
  await page.screenshot({ path: `${OUT}/multi-reopened.png`, fullPage: true });

  // Removing a row leaves the other.
  await page.getByTestId("devotional-passage-remove-2").click();
  await expectText("devotional-passage-display", "Genesis 1-3", "after removing Psalm 1");
  await expectCount("devotional-passage-book-2", 0, "after removing Psalm 1");

  // "Run on into Exodus" ends Genesis at its last chapter and adds Exodus,
  // then asks where Exodus ends.
  await page.getByTestId("devotional-passage-to-chapter").click();
  await page.getByTestId("passage-run-on").click();
  await page.getByText("Exodus 1: last chapter").waitFor();
  await page.screenshot({ path: `${OUT}/multi-run-on-sheet.png` });
  await page.getByTestId("passage-chapter-2").click();
  await sheetClosed();
  await expectText("devotional-passage-display", "Genesis 1-50\nExodus 1-2", "running on into the next book");
  await page.getByTestId("devotional-passage-remove-2").click();
  await page.getByTestId("devotional-passage-to-chapter").click();
  await page.getByTestId("passage-chapter-3").click();
  await sheetClosed();
  await expectText("devotional-passage-display", "Genesis 1-3", "back to Genesis 1-3");

  // A change to a row that would take the passage over 120 characters is
  // refused with a note; changes up to the limit go through.
  const song = "Song of Solomon 1:1-17";
  await page.getByTestId("devotional-passage-type").click();
  await page.getByTestId("devotional-passage-input").fill(Array(5).fill(song).join("; "));
  await page.getByTestId("devotional-passage-use-lists").click();
  await page.getByTestId("devotional-passage-book-5").waitFor();
  const startAtTen = async (row) => {
    await page.getByTestId(`devotional-passage-from-${row}`).click();
    await page.getByTestId("passage-verse-10").click();
  };
  for (const row of [3, 4]) {
    await startAtTen(row);
    await page.getByTestId("sheet-close").click();
    await sheetClosed();
  }
  const atLimit = [song, song, "Song of Solomon 1:10-17", "Song of Solomon 1:10-17", song];
  if (atLimit.join("; ").length !== 120) failures.push("the refusal setup isn't at the limit");
  await expectCount("devotional-passage-too-long", 0, "changes up to the limit");
  await startAtTen(5);
  await sheetClosed();
  await expectCount("devotional-passage-too-long", 1, "a change over the limit");
  await expectText("devotional-passage-display", atLimit.join("\n"), "the refused change");
  await page.getByTestId("devotional-passage-too-long").scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/multi-too-long-refused.png`, fullPage: true });
  await page.getByTestId("devotional-passage-remove-5").click();
  await expectCount("devotional-passage-too-long", 0, "after removing a row");

  // A saved one-chapter day looks as it always did: one row, no headings.
  await page.goto(`${BASE}/devotionals/${seed.devotionalDate}`);
  await page.getByTestId("devotional-passage-book").waitFor();
  await expectText("devotional-passage-display", "John 15:1-17", "the single-passage day");
  await expectCount("devotional-passage-book-2", 0, "the single-passage day");
  await expectCount("devotional-passage-remove", 0, "the single-passage day");
  const verse = await page.getByTestId("devotional-passage-to").getAttribute("aria-label");
  if (verse !== "To verse, 17") failures.push(`the single-passage day: To reads ${JSON.stringify(verse)}`);
  await page.screenshot({ path: `${OUT}/single-passage-day.png`, fullPage: true });
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await page.screenshot({ path: `${OUT}/multi-failed.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? "A day takes Genesis 1-3 and Psalm 1 from the lists, saves, reopens with both rows, refuses a change over 120 characters, and a one-chapter day still shows one row." : `${failures.length} step(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
