#!/usr/bin/env node
// Scissors paper rock between two people: the admin taps the staff member in
// the Garden and asks from their card, the staff member sees the ask and
// accepts it, and both get the three picks. Screenshots of the ask card and
// the picks, for before and after. The World's accessible targets don't take
// clicks themselves (the stage above them does), so a click lands at a
// target's middle, as a finger would.
//
// The World opens where you last were, and the checks before this one share
// the backend and accounts (chapel-pews leaves the admin in the Chapel), so
// both players walk to the Garden first.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";

const arg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
const BASE = (arg("base") ?? "http://localhost:8082").replace(/\/+$/, "");
const OUT = arg("out") ?? "check-rps-ask";
const seed = JSON.parse(readFileSync(arg("seed") ?? "sweep-seed.json", "utf8"));
const SECRET = process.env.SWEEP_E2E_SECRET ?? "sweep-only-secret";
const TIMEOUT_MS = 60_000;
const PICKS = ["scissors", "paper", "rock"];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const failures = [];
const expect = async (page, what, ok) => {
  if (!(await ok)) {
    failures.push(what);
    await page.screenshot({ path: `${OUT}/failed-${failures.length}.png` });
  }
};
// How the World names a seeded account: "sweep.staff@…" is "Sweep Staff",
// shown as "Sweep S." (accountName and shortName in shared/names.ts).
const worldNameOf = (email) => {
  const words = email.split("@")[0].split(/[._]/).map((word) => word[0].toUpperCase() + word.slice(1));
  return words.length > 1 ? `${words[0]} ${words.at(-1)[0]}.` : words[0];
};
const clickMiddle = async (page, locator) => {
  const box = await locator.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
};
const inGarden = (page) =>
  page.waitForFunction(() => document.querySelector('[data-testid="world-title"]')?.getAttribute("aria-label")?.startsWith("Garden"), null, { timeout: 2000 }).then(
    () => true,
    () => false
  );
const toGarden = async (page) => {
  await page.waitForTimeout(1500);
  if (await inGarden(page)) return;
  const pad = page.getByRole("button", { name: "Go to The Garden", exact: true });
  if ((await pad.count()) === 0) throw new Error(`not in the Garden and no way there from "${await page.getByTestId("world-title").getAttribute("aria-label")}"`);
  await clickMiddle(page, pad.first());
  await page.waitForFunction(() => document.querySelector('[data-testid="world-title"]')?.getAttribute("aria-label")?.startsWith("Garden"), null, { timeout: 30_000 });
  await page.getByTestId("world-me").waitFor({ state: "attached" });
};
const signedIn = async (email) => {
  const page = await (await browser.newContext({ viewport: { width: 430, height: 900 } })).newPage();
  page.setDefaultTimeout(TIMEOUT_MS);
  await page.goto(`${BASE}/e2e-auth?email=${encodeURIComponent(email)}&secret=${encodeURIComponent(SECRET)}`);
  await page.waitForFunction(() => Object.keys(localStorage).some((key) => key.startsWith("__convexAuthJWT_")));
  await page.goto(`${BASE}/world`);
  await page.getByTestId("world-title").waitFor();
  await page.getByTestId("world-me").waitFor({ state: "attached" });
  await toGarden(page);
  return page;
};

try {
  const asker = await signedIn(seed.people.admin);
  const asked = await signedIn(seed.people.staff);

  // The staff member's target, by the name the World shows for them.
  const target = asker.getByRole("button", { name: worldNameOf(seed.people.staff), exact: true }).first();
  await target.waitFor({ state: "attached", timeout: 30_000 });
  await clickMiddle(asker, target);
  await asker.getByTestId("world-hud-rps").click();

  // Asked: the card with the accept and Not now buttons.
  const card = asked.getByTestId("world-ask").first();
  await card.waitFor({ timeout: 30_000 });
  await asked.waitForTimeout(400);
  await card.screenshot({ path: `${OUT}/rps-ask-card.png` });
  await asked.screenshot({ path: `${OUT}/rps-ask.png` });
  const accept = asked.getByTestId("world-ask-accept").first();
  const label = await accept.getAttribute("aria-label");
  console.log(`accept button: "${(await accept.innerText()).replace(/\n/g, " / ")}", read as "${label}"`);
  const yes = await accept.boundingBox();
  const no = await asked.getByTestId("world-ask-decline").first().boundingBox();
  await expect(asked, "the accept button is no taller than Not now", yes.height <= no.height + 4);
  await expect(asked, "the accept button lines up with Not now", Math.abs(yes.y - no.y) <= 2 && Math.abs(yes.height - no.height) <= 2);
  await accept.click();

  // Both get the picks, scissors to rock from left to right.
  for (const page of [asked, asker]) {
    await page.getByTestId("world-duel").waitFor({ timeout: 30_000 });
    const xs = [];
    for (const pick of PICKS) xs.push((await page.getByTestId(`world-duel-${pick}`).boundingBox()).x);
    await expect(page, "the picks read scissors, paper, rock", xs[0] < xs[1] && xs[1] < xs[2]);
  }
  await asked.getByTestId("world-duel").screenshot({ path: `${OUT}/rps-picks-card.png` });
  await asked.screenshot({ path: `${OUT}/rps-picks.png` });
  await asker.screenshot({ path: `${OUT}/rps-picks-asker.png` });
} catch (error) {
  failures.push(String(error).split("\n")[0]);
  // What each player saw when it stopped.
  for (const [i, context] of browser.contexts().entries())
    for (const page of context.pages()) await page.screenshot({ path: `${OUT}/rps-failed-player-${i + 1}.png` }).catch(() => {});
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`✘ ${failure}`);
console.log(
  failures.length === 0
    ? "Scissors paper rock: asked from a person's card in the Garden, accepted from the ask card, and both players got the picks in order."
    : `${failures.length} check(s) failed.`
);
process.exit(failures.length === 0 ? 0 : 1);
