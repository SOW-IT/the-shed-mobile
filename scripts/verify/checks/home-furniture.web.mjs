#!/usr/bin/env node
// At home: a tap on each chair, beanbag, sofa and bed you've placed sits you
// on it, and a tap on the floor stands you up. Then, decorating, the sofa is
// dragged with the mouse: nothing is sent while it moves, one moveItem when
// it's let go, and it stays where it was dropped. A chair taken from the tray
// is sent nowhere until it's dragged and dropped: then one placeItem.
// The seed (scripts/sweep-seed.mjs) furnishes the admin's home and leaves a
// second chair in the tray. Mutations are counted from the Convex
// websocket's frames. The World's accessible targets don't take clicks
// themselves (the stage above them does), so a click lands at a target's
// middle, as a finger would.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-home-furniture";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
const WALK_MS = 20_000;
const SEATS = ["Sofa", "Chair", "Beanbag", "Bed"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
page.setDefaultTimeout(TIMEOUT_MS);

const sent = [];
page.on("websocket", (ws) =>
  ws.on("framesent", (frame) => {
    const found = /"udfPath":"worldHome:([a-zA-Z]+)"/.exec(String(frame.payload));
    if (found) sent.push(found[1]);
  })
);
const sentOf = (name) => sent.filter((fn) => fn === name).length;

const failures = [];
const shot = (name) => page.screenshot({ path: `${OUT}/home-${name}.png` });
const me = () => page.getByTestId("world-me");
const clickMiddle = async (locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const waitForMe = (label) =>
  page.waitForFunction((want) => document.querySelector('[data-testid="world-me"]')?.getAttribute("aria-label") === want, label, { timeout: WALK_MS }).then(
    () => true,
    () => false
  );
/** Presses at `from`, moves to `to` in steps (a shot partway), and lets go. */
const drag = async (from, to, name) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 16; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 16, from.y + ((to.y - from.y) * i) / 16);
    await page.waitForTimeout(30);
    if (i === 8) await shot(`${name}-dragging`);
  }
  await page.waitForTimeout(300);
  return () => page.mouse.up();
};

try {
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(seed.people.admin)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world`);
  await page.getByTestId("world-title").waitFor();
  await me().waitFor({ state: "attached" });
  await page.waitForTimeout(1500);
  // Home from the title's menu, unless an earlier run left you there.
  if ((await page.getByTestId("world-decorate-open").count()) === 0) {
    await page.getByTestId("world-title").click();
    await page.getByLabel("Go to your home").click();
  }
  await page.getByTestId("world-decorate-open").waitFor();
  await page.waitForTimeout(1500);
  await shot("arrived");

  // Sit on each piece in turn.
  for (const name of SEATS) {
    const target = page.getByLabel(`${name}, sit down`);
    if ((await target.count()) === 0) {
      failures.push(`${name}: not offered as a seat`);
      continue;
    }
    await clickMiddle(target);
    if (!(await waitForMe("You, sitting"))) failures.push(`${name}: not seated (${await me().getAttribute("aria-label")})`);
    await page.waitForTimeout(700);
    await shot(`sit-${name.toLowerCase()}`);
  }

  // A tap on the floor, away from everything: up and walking there.
  const stage = await page.getByTestId("world-stage").boundingBox();
  await page.mouse.click(stage.x + stage.width * 0.3, stage.y + stage.height * 0.72);
  if (!(await waitForMe("You"))) failures.push(`floor tap: still ${await me().getAttribute("aria-label")}`);
  await page.waitForTimeout(1500);
  await shot("stood-up");

  // Decorating: drag the sofa. The sofa's first seat, before the tray covers the labels.
  const sofa = await page.getByLabel("Sofa, sit down").boundingBox();
  const from = { x: sofa.x + sofa.width / 2 + 15, y: sofa.y + sofa.height / 2 + 10 };
  await page.getByTestId("world-decorate-open").click();
  await page.getByTestId("world-decorate").waitFor();
  await page.waitForTimeout(800);
  if ((await page.getByLabel(/, sit down$/).count()) > 0) failures.push("decorating: furniture still offered as seats");
  await shot("decorate");
  const moves = sentOf("moveItem");
  const letGo = await drag(from, { x: from.x + 20, y: from.y + 130 }, "sofa");
  await shot("sofa-held");
  if (sentOf("moveItem") !== moves) failures.push(`sofa drag: ${sentOf("moveItem") - moves} moveItem sent before it was let go`);
  await letGo();
  await page.waitForTimeout(100);
  await shot("sofa-dropped");
  await page.waitForTimeout(2000);
  await shot("sofa-saved");
  if (sentOf("moveItem") - moves !== 1) failures.push(`sofa drop: ${sentOf("moveItem") - moves} moveItem sent, wanted 1`);
  await page.getByLabel("Done moving it").click();

  // The second chair, from the tray: nothing sent until it's dragged and dropped.
  const places = sentOf("placeItem");
  await page.getByTestId("world-place-chair").click();
  const hud = await page.getByLabel("Turn the chair").locator("xpath=../..").boundingBox();
  await page.waitForTimeout(800);
  await shot("chair-draft");
  if (sentOf("placeItem") !== places) failures.push("new chair: placeItem sent before it was put down");
  const chair = { x: hud.x + hud.width / 2, y: hud.y + hud.height + 42 };
  const putDown = await drag(chair, { x: chair.x - 40, y: chair.y + 90 }, "chair");
  if (sentOf("placeItem") !== places) failures.push("new chair: placeItem sent while dragging");
  await putDown();
  await page.waitForTimeout(100);
  await shot("chair-dropped");
  await page.waitForTimeout(2000);
  await shot("chair-saved");
  if (sentOf("placeItem") - places !== 1) failures.push(`new chair: ${sentOf("placeItem") - places} placeItem sent, wanted 1`);
  await page.getByTestId("world-decorate-done").click();
  await page.waitForTimeout(1000);
  if (sentOf("placeItem") - places !== 1) failures.push("new chair: saved again when decorating closed");
  await shot("done");
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  await shot("failed").catch(() => {});
} finally {
  await browser.close();
}

console.log(`Sent: ${sent.join(", ")}`);
for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Home: a chair, beanbag, sofa and bed each seat you and a floor tap stands you up; a dragged sofa sends one moveItem when let go, and a chair from the tray one placeItem when put down."
    : `${failures.length} step(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);
