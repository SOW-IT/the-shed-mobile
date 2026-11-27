#!/usr/bin/env node
// The character editor's preview frames the part each tab changes: the face,
// close on the eyes, the brows and the mouth, the head for hair and hats, the
// whole body, the outfit from the mouth down to the shoes, and the head down
// to the waist for the extras. A screenshot of the preview on each tab, and each
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
  // The wide shots (Body, Outfit, Extras) turn on their own a few seconds
  // after the editor opens. A tap on the preview while it faces you on Hair
  // stops that, so each wide shot is taken facing you and the comparison
  // below is of framing, not of how far it had turned.
  for (const tab of TABS) {
    if (tab === "body") await preview.click();
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
  const zoom = page.getByTestId("world-editor-zoom");
  const zoomNow = async () => Number(await zoom.getAttribute("aria-valuenow"));
  const previewShot = async (name) => page.screenshot({ path: `${OUT}/zoom-${name}.png`, clip: await preview.boundingBox() });
  await page.getByTestId("world-editor-tab-eyes").click();
  await page.waitForTimeout(SETTLE_MS);
  const eyesZoom = await zoomNow();
  const eyesShot = await previewShot("eyes");
  await zoom.focus();
  await page.keyboard.press("End");
  await page.waitForTimeout(300);
  if ((await zoomNow()) !== 100) failures.push(`End zooms the slider to ${await zoomNow()}, not 100`);
  const closest = await previewShot("closest");
  await page.keyboard.press("ArrowUp");
  if ((await zoomNow()) !== 100) failures.push("the slider zooms past its closest");
  await page.keyboard.press("Home");
  await page.waitForTimeout(300);
  if ((await zoomNow()) !== 0) failures.push(`Home zooms the slider to ${await zoomNow()}, not 0`);
  const widest = await previewShot("widest");
  await page.keyboard.press("ArrowDown");
  if ((await zoomNow()) !== 0) failures.push("the slider zooms out past the whole character");
  await page.keyboard.press("ArrowUp");
  if ((await zoomNow()) !== 5) failures.push(`an arrow key steps the zoom to ${await zoomNow()}, not 5`);
  if (closest.equals(eyesShot) || widest.equals(eyesShot) || closest.equals(widest)) failures.push("the zoom slider doesn't change the preview");
  await page.getByTestId("world-editor-tab-mouth").click();
  await page.getByTestId("world-editor-tab-eyes").click();
  await page.waitForTimeout(SETTLE_MS);
  if ((await zoomNow()) !== eyesZoom) failures.push(`back on Eyes the zoom is ${await zoomNow()}, not the tab's own ${eyesZoom}`);
  await page.getByTestId("world-editor-close").click();
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? `The preview frames each of the ${TABS.length} tabs differently.` : `${failures.length} problem(s).`);
process.exit(failures.length === 0 ? 0 : 1);
