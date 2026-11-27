#!/usr/bin/env node
// Swoop's borders on web. A tall desktop window is outside Swoop's shapes, so
// the board sits between even black borders, the same above as below: the
// ground stops at the board instead of running down to the bottom edge
// (since #557 it did, which left only a black band above). A normal desktop
// window is inside the shapes, and the scene fills it to every edge.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-swoop-letterbox";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
// The letterbox is #000000; anti-aliasing at the board's edge may tint a row.
const BLACK = 12;

const WINDOWS = [
  { name: "tall", width: 430, height: 900, bordered: true },
  { name: "desktop", width: 1440, height: 900, bordered: false },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];

/** Rows from `from` up to `to` (exclusive) that hold a pixel that isn't black. */
const paintedRows = (png, from, to) => {
  const rows = [];
  for (let y = Math.max(0, from); y < Math.min(png.height, to); y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i] > BLACK || png.data[i + 1] > BLACK || png.data[i + 2] > BLACK) {
        rows.push(y);
        break;
      }
    }
  }
  return rows;
};

try {
  for (const { name, width, height, bordered } of WINDOWS) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.setDefaultTimeout(TIMEOUT_MS);
    try {
      await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
      await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
      await page.goto(`${BASE}/games/glider`);
      const area = page.getByTestId("game-play-area").first();
      await area.waitFor();
      await page.getByTestId("glider-scene").first().waitFor();
      await page.waitForTimeout(1_500);
      const box = await area.boundingBox();
      const shot = await page.screenshot({ path: `${OUT}/swoop-${name}-${width}x${height}.png` });
      const png = PNG.sync.read(shot);
      const top = Math.floor(box.y);
      const bottom = Math.ceil(box.y + box.height);
      if (bordered) {
        const above = top;
        const below = height - bottom;
        if (Math.abs(above - below) > 2) failures.push(`${name}: borders aren't even (${above}px above, ${below}px below)`);
        if (above < 40) failures.push(`${name}: expected black borders, the play area fills ${box.height}px of ${height}px`);
        const overTop = paintedRows(png, 0, top - 1);
        const underBottom = paintedRows(png, bottom + 1, height);
        if (overTop.length > 0) failures.push(`${name}: ${overTop.length} rows above the board aren't black (first at y=${overTop[0]})`);
        if (underBottom.length > 0) failures.push(`${name}: ${underBottom.length} rows below the board aren't black, the ground runs on (first at y=${underBottom[0]})`);
      } else {
        const black = height - paintedRows(png, 0, height).length;
        if (black > 0) failures.push(`${name}: ${black} rows are black, the scene should fill the window`);
      }
    } catch (error) {
      failures.push(`${name}: ${String(error).split("\n")[0]}`);
      await page.screenshot({ path: `${OUT}/failed-${name}.png` }).catch(() => {});
    } finally {
      await page.close();
    }
  }
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Swoop's borders: a tall window shows even black borders above and below the board, and a 1440x900 window is filled edge to edge."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);
