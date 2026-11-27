#!/usr/bin/env node
// The character editor's preview frames the part each tab changes: the face,
// close on the eyes, the brows and the mouth, the head for hair and hats, the
// whole body, the outfit from the mouth down to the shoes, and the head and
// shoulders for the extras. A screenshot of the preview on each tab, and each
// tab's framing must differ from the others'.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-character-camera";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
/** Longer than the preview's glide (PREVIEW_GLIDE_MS) and its turn to the front. */
const SETTLE_MS = 1_500;
const TABS = ["face", "eyes", "brows", "mouth", "hair", "body", "outfit", "extras"];
/** The seeded character has no brows, mouth or extra; pick one so the shot shows it. Never saved. */
const PICKS = { brows: "world-editor-brows-3", mouth: "world-editor-mouth-1", extras: "world-editor-extra-6" };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const shots = new Map();

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world?sheet=character`, { waitUntil: "domcontentloaded" });
  const preview = page.getByTestId("world-editor-preview");
  await preview.waitFor();
  // The wide shots start turning after a few seconds; shoot them before then.
  for (const tab of TABS) {
    await page.getByTestId(`world-editor-tab-${tab}`).click();
    if (PICKS[tab]) await page.getByTestId(PICKS[tab]).click();
    await page.waitForTimeout(SETTLE_MS);
    // A clip of the page, not the element: an element screenshot waits for the
    // preview to hold still, and the wide shots keep turning.
    const clip = await preview.boundingBox();
    shots.set(tab, await page.screenshot({ path: `${OUT}/camera-${tab}.png`, clip }));
    await page.screenshot({ path: `${OUT}/editor-${tab}.png` });
  }
  for (const [i, a] of TABS.entries()) {
    for (const b of TABS.slice(i + 1)) {
      if (shots.get(a).equals(shots.get(b))) failures.push(`the ${a} and ${b} tabs frame the character the same`);
    }
  }
  await page.getByTestId("world-editor-close").click();
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? `The preview frames each of the ${TABS.length} tabs differently.` : `${failures.length} problem(s).`);
process.exit(failures.length === 0 ? 0 : 1);
