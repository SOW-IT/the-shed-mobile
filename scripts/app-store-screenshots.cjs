// App Store screenshot generator.
//
// Renders the web build (expo web) at the exact pixel dimensions App Store
// Connect requires and writes one PNG per device size.
//
//   13-inch iPad   -> 2048 x 2732  (viewport 1024x1366 @ DSF 2)
//   6.5-inch iPhone -> 1242 x 2688 (viewport 414x896  @ DSF 3)
//
// App Store Connect validates the *file's* pixel dimensions, so we render the
// mobile layout at a small CSS viewport and use deviceScaleFactor to scale the
// output up to the required resolution.
//
// Auth: launches a HEADED browser against a persistent profile dir. On the
// first run you sign in once (Google usually remembers the session); the
// profile is reused for every size and on later runs, so no tokens are ever
// written to disk by this script.
//
// Usage:
//   NODE_PATH=/tmp/pw-shed/node_modules node scripts/app-store-screenshots.cjs
//   URL=http://localhost:8081 ROUTES=/,/profile node scripts/app-store-screenshots.cjs
//
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const URL = process.env.URL || "http://localhost:8081";
const ROUTES = (process.env.ROUTES || "/").split(",").map((r) => r.trim());
const PROFILE_DIR = process.env.PROFILE_DIR || "/tmp/pw-shed-profile";
const OUT_DIR = path.resolve(__dirname, "..", "app-store-screenshots");
// Text that only appears once the authenticated app has rendered. Used to
// detect "logged in", and to wait for the screen to settle before shooting.
const LOGGED_IN_MARKER = process.env.MARKER || "Make Request";

// NOTE: do NOT set isMobile/a mobile userAgent. The web app sniffs the UA and
// redirects mobile browsers to the App Store listing. react-native-web lays out
// by window width, so a narrow viewport alone yields the phone layout; the
// deviceScaleFactor scales the output up to the required App Store resolution.
const DEVICES = [
  {
    name: "ipad-13in", // -> 2048 x 2732
    viewport: { width: 1024, height: 1366 },
    deviceScaleFactor: 2,
  },
  {
    name: "iphone-6.5in", // -> 1242 x 2688
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
  // Let Convex data + images settle.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);
}

// Optional headless auth injection. When CONVEX_JWT (+ optional
// CONVEX_REFRESH) are set, seed them into localStorage before the app boots so
// a headless browser comes up logged in — no display / manual login needed.
// The Convex deployment slug is part of the storage key (see the live app's
// localStorage keys). Defaults to the dev deployment.
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
      // Stateless: fresh context per size, auth injected at init.
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
      // Persistent context => the login from the first device carries over.
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
      await page.screenshot({ path: file }); // viewport-only => exact device px
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
