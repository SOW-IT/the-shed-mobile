const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const URL = process.env.URL || "http://localhost:8081";
const ROUTES = (process.env.ROUTES || "/").split(",").map((r) => r.trim());
const PROFILE_DIR = process.env.PROFILE_DIR || "/tmp/pw-shed-profile";
const OUT_DIR = path.resolve(__dirname, "..", "app-store-screenshots");
const LOGGED_IN_MARKER = process.env.MARKER || "Make Request";

const DEVICES = [
  {
    name: "ipad-13in",
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
  },
  {
    name: "iphone-6.5in",
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 3,
  },
];

async function waitForApp(page, { allowLogin }) {
  const timeout = allowLogin ? 240_000 : 60_000;
  if (allowLogin) {
    console.log(
      "\n  >> If a sign-in screen appears, log in now. Waiting up to 4 min...\n",
    );
  }
  await page.waitForFunction(
    (marker) => document.body && document.body.innerText.includes(marker),
    LOGGED_IN_MARKER,
    { timeout },
  );
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
}

const JWT = process.env.CONVEX_JWT;
const REFRESH = process.env.CONVEX_REFRESH;
const SLUG = process.env.CONVEX_SLUG || "httpsindustriousrobin425convexcloud";
const HEADLESS = !!JWT || process.env.HEADLESS === "1";

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let first = true;
  let browser = null;

  for (const device of DEVICES) {
    let context;
    if (JWT) {
      browser = browser || (await chromium.launch({ headless: true }));
      context = await browser.newContext({
        viewport: device.viewport,
        deviceScaleFactor: device.deviceScaleFactor,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
      });
      await context.addInitScript(
        ({ jwt, refresh, slug }) => {
          localStorage.setItem(`__convexAuthJWT_${slug}`, jwt);
          if (refresh) localStorage.setItem(`__convexAuthRefreshToken_${slug}`, refresh);
        },
        { jwt: JWT, refresh: REFRESH, slug: SLUG },
      );
    } else {
      context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: HEADLESS,
        viewport: device.viewport,
        deviceScaleFactor: device.deviceScaleFactor,
        isMobile: device.isMobile,
        hasTouch: device.hasTouch,
      });
    }
    const page = context.pages()[0] || (await context.newPage());

    for (const route of ROUTES) {
      const url = URL.replace(/\/$/, "") + route;
      console.log(`[${device.name}] -> ${url}`);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await waitForApp(page, { allowLogin: first && !JWT });
      first = false;

      const slug = route === "/" ? "home" : route.replace(/\W+/g, "-").replace(/^-|-$/g, "");
      const file = path.join(OUT_DIR, `${device.name}__${slug}.png`);
      await page.screenshot({ path: file });
      const { width, height } = await page.evaluate(() => ({
        width: window.innerWidth * window.devicePixelRatio,
        height: window.innerHeight * window.devicePixelRatio,
      }));
      console.log(`   saved ${file}  (${width}x${height})`);
    }

    await context.close();
  }
  if (browser) await browser.close();

  console.log(`\nDone. Screenshots in: ${OUT_DIR}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
