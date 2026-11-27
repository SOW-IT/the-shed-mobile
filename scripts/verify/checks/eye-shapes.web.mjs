#!/usr/bin/env node
// Every eye shape in the character editor: each tile is picked in turn and
// the editor (its preview and the tiles) is shot. Then the last one is saved,
// the World is shot with it, and the editor opens again with it still picked,
// so the server took it. Last, the eyes the account had are saved back, so
// the iOS run and the other checks on this backend see the seeded look. It
// shoots whatever tiles there are, so the base's run shows the shapes from
// before.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-eye-shapes";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
// The server ignores a second save of a look within this (LOOK_SAVE_GAP_MS).
const SAVE_GAP_MS = 3_000;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const tile = (i) => page.getByTestId(`world-editor-eyes-${i}`);
// React Native Web drops accessibilityState, so the tile's selected state
// isn't in the DOM. The picked tile is the one with the tick, an icon glyph
// and the only text inside a tile.
const picked = async (i) => (await tile(i).innerText()).trim().length > 0;
const openEyes = async () => {
  await page.getByTestId("world-editor").waitFor();
  await page.getByTestId("world-editor-tab-eyes").click();
  await tile(0).waitFor();
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world?sheet=character`);
  await openEyes();
  const count = await page.locator('[data-testid^="world-editor-eyes-"]').count();
  let original = 0;
  for (let i = 0; i < count; i++) if (await picked(i)) original = i;
  await page.screenshot({ path: `${OUT}/eyes-tiles.png` });
  for (let i = 0; i < count; i++) {
    await tile(i).scrollIntoViewIfNeeded();
    await tile(i).click();
    if (!(await picked(i))) failures.push(`tile ${i} (${await tile(i).getAttribute("aria-label")}) didn't pick`);
    const name = (await tile(i).getAttribute("aria-label")).toLowerCase().replace(/\s+/g, "-");
    await page.screenshot({ path: `${OUT}/eyes-${String(i).padStart(2, "0")}-${name}.png` });
  }
  const last = count - 1;
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByTestId("world-editor").waitFor({ state: "hidden" });
  await page.getByTestId("world-me").waitFor();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: `${OUT}/eyes-saved-world.png` });
  await page.goto(`${BASE}/world?sheet=character`);
  await openEyes();
  await tile(last).scrollIntoViewIfNeeded();
  if (!(await picked(last))) failures.push(`the saved shape (tile ${last}) wasn't picked when the editor opened again`);
  await page.screenshot({ path: `${OUT}/eyes-saved-reopened.png` });
  // Put the account's own eyes back.
  await page.waitForTimeout(SAVE_GAP_MS + 500);
  await tile(original).scrollIntoViewIfNeeded();
  await tile(original).click();
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByTestId("world-editor").waitFor({ state: "hidden" });
  await page.goto(`${BASE}/world?sheet=character`);
  await openEyes();
  if (!(await picked(original))) failures.push(`the account's own eyes (tile ${original}) didn't come back after the check`);
  console.log(`${count} eye shapes shot; tile ${original} saved back.`);
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await page.screenshot({ path: `${OUT}/eyes-failed.png` }).catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? "Every eye shape picks and shows in the editor, and a saved one comes back." : `${failures.length} problem(s).`);
process.exit(failures.length === 0 ? 0 : 1);
