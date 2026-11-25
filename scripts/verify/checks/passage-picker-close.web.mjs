#!/usr/bin/env node
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-passage-picker-close";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const sheetOpen = () => page.getByPlaceholder("Search books").isVisible();

const openScrolled = async (way) => {
  await page.getByTestId("devotional-passage-book").click();
  await page.getByPlaceholder("Search books").waitFor();
  const list = await page.getByTestId("sheet-list").boundingBox();
  await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
  await page.getByRole("radio", { name: /^Revelation/ }).waitFor();
  if (!(await page.getByTestId("sheet-close").isVisible())) failures.push(`${way}: the close button scrolled away`);
  await page.screenshot({ path: `${OUT}/${way}-scrolled.png` });
};

const ways = {
  "close-button": () => page.getByTestId("sheet-close").click(),
  escape: () => page.keyboard.press("Escape"),
  backdrop: () => page.mouse.click(12, 12),
  "header-drag": async () => {
    const header = await page.getByTestId("sheet-header").boundingBox();
    const x = header.x + 40;
    const y = header.y + header.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let step = 1; step <= 12; step++) await page.mouse.move(x, y + step * 15);
    await page.mouse.up();
  },
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/devotionals/${seed.devotionalEmptyDate}`);
  await page.getByTestId("devotional-passage-book").waitFor();
  for (const [way, close] of Object.entries(ways)) {
    await openScrolled(way);
    await close();
    await page.getByPlaceholder("Search books").waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    if (await sheetOpen()) {
      failures.push(`${way}: the sheet stayed open`);
      await page.screenshot({ path: `${OUT}/${way}-still-open.png` });
      await page.getByTestId("sheet-close").click();
      await page.getByPlaceholder("Search books").waitFor({ state: "hidden" });
    }
  }
  const scrollSheetAndClose = async (name, last) => {
    const list = await page.getByTestId("sheet-list").boundingBox();
    await page.mouse.move(list.x + list.width / 2, list.y + list.height / 2);
    for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 600);
    await page.getByTestId(last).waitFor();
    await page.screenshot({ path: `${OUT}/${name}-scrolled.png` });
    await page.getByTestId("sheet-close").click();
    await page.getByTestId("sheet-list").waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
    if (await page.getByTestId("sheet-list").isVisible()) {
      failures.push(`${name}: the sheet stayed open`);
      await page.screenshot({ path: `${OUT}/${name}-still-open.png` });
    }
  };
  await page.getByTestId("devotional-passage-book").click();
  await page.getByPlaceholder("Search books").fill("Psal");
  await page.getByRole("radio", { name: /^Psalms/ }).click();
  await page.getByTestId("passage-chapter-1").waitFor();
  await scrollSheetAndClose("chapter", "passage-chapter-150");
  await page.getByTestId("devotional-passage-chapter").click();
  await page.getByTestId("passage-chapter-119").click();
  await page.getByTestId("sheet-list").waitFor({ state: "hidden" });
  await page.getByTestId("devotional-passage-from").click();
  await scrollSheetAndClose("verse", "passage-verse-176");
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? "Passage pickers close after scrolling: Book by close button, Escape, backdrop and header drag; Chapter and Verse by close button." : `${failures.length} way(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
