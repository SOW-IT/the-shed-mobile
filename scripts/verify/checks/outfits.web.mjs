#!/usr/bin/env node
// The character editor's outfits: sleeves (short and long), the new tops,
// and the "any colour" picker under the top's colour row. Nothing is saved,
// so the look the other checks see doesn't change.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-outfits";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
// The tops after the twelve from before, by their index (OUTFITS in shared/world.ts).
const NEW_TOPS = { 12: "tank-top", 13: "sailor-top", 14: "sweater-vest", 15: "sundress", 16: "jumpsuit", 17: "hawaiian-shirt" };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const preview = () => page.getByTestId("world-editor-preview");
const shot = (name) => preview().screenshot({ path: `${OUT}/outfits-${name}.png` });
const pick = async (testID) => {
  await page.getByTestId(testID).click();
  await page.waitForTimeout(300);
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world?sheet=character`);
  await page.getByTestId("world-editor").waitFor();
  await page.getByTestId("world-editor-tab-outfit").click();

  // Sleeves on a collared shirt: none, short, long.
  await pick("world-editor-outfit-6");
  for (const [i, name] of ["none", "short", "long"].entries()) {
    await pick(`world-editor-sleeves-${i}`);
    await shot(`collared-sleeves-${name}`);
  }
  for (const [i, name] of Object.entries(NEW_TOPS)) {
    await pick(`world-editor-outfit-${i}`);
    await shot(name);
  }
  // The tank top has no sleeves choice.
  await pick("world-editor-outfit-12");
  if ((await page.getByTestId("world-editor-sleeves-0").count()) > 0) failures.push("tank top: offers sleeves");

  // Any colour: the picker opens under the row, and a typed hex colours the top.
  await pick("world-editor-outfit-0");
  await pick("world-editor-sleeves-1");
  await pick("world-editor-shirt-custom");
  const picker = page.getByTestId("world-editor-shirt-picker");
  await picker.waitFor();
  await page.getByTestId("world-editor-shirt-hex").fill("#3A9AD9");
  await page.waitForTimeout(300);
  await picker.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/outfits-colour-picker.png` });
  await shot("custom-colour");
  // Back to a palette colour: the picker closes.
  await pick("world-editor-shirt-4");
  if (await picker.isVisible()) failures.push("picker: still open after picking a palette colour");
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await page.screenshot({ path: `${OUT}/outfits-failed.png` }).catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? "Outfits: sleeves, the six new tops and the any-colour picker all draw in the editor." : `${failures.length} step(s) failed.`);
process.exit(failures.length === 0 ? 0 : 1);
