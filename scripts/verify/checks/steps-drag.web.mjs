#!/usr/bin/env node
// The character editor's step sliders (Height and Build on Body, the placement
// sliders on Eyes) drag from anywhere on the thumb or around the line, to both
// ends, and keep tracking when the pointer strays above or below the slider. A
// touch drag moves the slider and doesn't scroll the choices. Nothing is
// saved, so the look the other checks see doesn't change.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-steps-drag";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
/** Half the thumb: the track sits this far in from each end of the slider. */
const HALF_THUMB = 13;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, hasTouch: true });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const settle = () => page.waitForTimeout(150);

/** One slider: where each step sits, and its value (1 to count). */
const slider = async (testID) => {
  const el = page.getByTestId(testID);
  await el.scrollIntoViewIfNeeded();
  await settle();
  const box = await el.boundingBox();
  const count = Number(await el.getAttribute("aria-valuemax"));
  // Before this check, the slider was only its 8px line, with no inset.
  const inset = box.height > 20 ? HALF_THUMB : 0;
  const left = box.x + inset;
  const width = box.width - 2 * inset;
  return {
    el,
    count,
    y: box.y + box.height / 2,
    x: (i) => left + (i / (count - 1)) * width,
    now: async () => Number(await el.getAttribute("aria-valuenow")),
    home: async () => {
      await el.focus();
      await page.keyboard.press("Home");
      await settle();
    },
  };
};

const drag = async (from, path) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const to of path) await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await settle();
};

const expect = async (s, name, want) => {
  const got = await s.now();
  if (got !== want) failures.push(`${name}: ${got}, not ${want}`);
};

const checkSlider = async (testID) => {
  const s = await slider(testID);
  const last = s.count - 1;
  const mid = Math.floor(last / 2);

  await s.home();
  await drag({ x: s.x(0), y: s.y - 10 }, [{ x: s.x(last) + 40, y: s.y - 10 }]);
  await expect(s, `${testID}, dragged by the top of the thumb past the far end`, s.count);

  await drag({ x: s.x(last) + 8, y: s.y + 9 }, [{ x: s.x(0) - 40, y: s.y + 9 }]);
  await expect(s, `${testID}, dragged by the bottom edge of the thumb past the near end`, 1);

  await drag({ x: s.x(mid), y: s.y - 7 }, []);
  await expect(s, `${testID}, tapped just above the line`, mid + 1);

  await s.home();
  await drag({ x: s.x(0), y: s.y }, [{ x: s.x(mid), y: s.y + 60 }]);
  await expect(s, `${testID}, dragged with the pointer wandering below the slider`, mid + 1);
  await drag({ x: s.x(mid), y: s.y }, [{ x: s.x(last), y: s.y - 60 }]);
  await expect(s, `${testID}, dragged with the pointer wandering above the slider`, s.count);

  // Every step, one at a time, on the way back.
  await page.mouse.move(s.x(last), s.y);
  await page.mouse.down();
  const missed = [];
  for (let i = last; i >= 0; i -= 1) {
    await page.mouse.move(s.x(i), s.y + (i % 2 === 0 ? 8 : -8), { steps: 4 });
    await settle();
    if ((await s.now()) !== i + 1) missed.push(i + 1);
  }
  await page.mouse.up();
  if (missed.length > 0) failures.push(`${testID}, a slow drag along the line misses step(s) ${missed.join(", ")}`);
  return s;
};

/** A finger drag (Chrome's touch events, as on a phone) from the thumb to the far end. */
const touchDrag = async (s) => {
  await s.home();
  const scroller = () =>
    s.el.evaluate((node) => {
      for (let p = node.parentElement; p; p = p.parentElement) {
        const style = getComputedStyle(p);
        if (/(auto|scroll)/.test(style.overflowY) && p.scrollHeight > p.clientHeight) return p.scrollTop;
      }
      return null;
    });
  const before = await scroller();
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
  await touch("touchStart", s.x(0), s.y);
  // A finger drifts: a little down while it moves along.
  for (let k = 1; k <= 12; k += 1) await touch("touchMove", s.x(0) + ((s.x(s.count - 1) - s.x(0)) * k) / 12, s.y + k * 3);
  await touch("touchEnd");
  await settle();
  await expect(s, "height, a touch drag to the far end", s.count);
  const after = await scroller();
  if (before !== after) failures.push(`height, a touch drag scrolled the choices (${before} to ${after})`);
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world?sheet=character`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("world-editor").waitFor();

  await page.getByTestId("world-editor-tab-body").click();
  const height = await checkSlider("world-editor-height");
  await checkSlider("world-editor-build");
  await touchDrag(height);
  await page.screenshot({ path: `${OUT}/steps-body.png` });

  await page.getByTestId("world-editor-tab-eyes").click();
  await checkSlider("world-editor-eyeY");
  await page.screenshot({ path: `${OUT}/steps-eyes.png` });

  await page.getByTestId("world-editor-close").click();
} catch (error) {
  failures.push(String(error).split("\n")[0]);
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(failures.length === 0 ? "The step sliders drag from anywhere on the thumb or the line, to both ends." : `${failures.length} problem(s).`);
process.exit(failures.length === 0 ? 0 : 1);
