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

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 }, hasTouch: true });
page.setDefaultTimeout(TIMEOUT_MS);

const failures = [];
const settle = () => page.waitForTimeout(150);

/**
 * One slider: where each step sits, and its value (1 to count), read from the
 * page itself (the stop dots and where the thumb is) so it reads the same
 * before and after this check was added. Where the slider has aria-valuenow,
 * it has to agree.
 */
const slider = async (testID) => {
  const el = page.getByTestId(testID);
  await el.scrollIntoViewIfNeeded();
  await settle();
  const read = () =>
    el.evaluate((node) => {
      const divs = [...node.querySelectorAll("div")];
      const centre = (d) => {
        const r = d.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const stops = divs.filter((d) => Math.round(d.getBoundingClientRect().width) === 6).map(centre);
      const thumb = divs.findLast((d) => Math.round(d.getBoundingClientRect().width) === 26);
      return { stops, thumb: thumb ? centre(thumb).x : null, aria: node.getAttribute("aria-valuenow") };
    });
  const key = async (name) => {
    await el.focus();
    await page.keyboard.press(name);
    await settle();
  };
  const { stops } = await read();
  if (stops.length < 2) throw new Error(`${testID}: found ${stops.length} step dot(s)`);
  const count = stops.length;
  const spacing = (stops[count - 1].x - stops[0].x) / (count - 1);
  return {
    el,
    count,
    y: stops[0].y,
    x: (i) => stops[0].x + i * spacing,
    now: async () => {
      const { thumb, aria } = await read();
      if (thumb === null) throw new Error(`${testID}: no thumb`);
      const value = Math.round((thumb - stops[0].x) / spacing) + 1;
      if (aria !== null && Number(aria) !== value) failures.push(`${testID}: aria-valuenow says ${aria}, the thumb is on ${value}`);
      return value;
    },
    home: () => key("Home"),
    end: () => key("End"),
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

  await s.end();
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
