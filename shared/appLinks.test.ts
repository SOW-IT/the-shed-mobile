import { describe, expect, test } from "vitest";
import {
  APP_LINKS,
  appLinkFor,
  appLinkForScheme,
  appCanOpen,
  appVariantFrom,
  compareVersions,
  isAppVersion,
  updateStatusFor,
  versionNeededFor,
} from "./appLinks";

describe("appLinks", () => {
  test("the dev web hands over to the staging app, with no store to fall back to", () => {
    expect(appVariantFrom("staging")).toBe("staging");
    expect(appVariantFrom(" Staging ")).toBe("staging");
    expect(appLinkFor("staging")).toEqual({
      scheme: "theshedmobilestaging",
      web: "https://the-shed-web-dev.vercel.app",
      iosStore: null,
      androidStore: null,
    });
  });

  test("anything else is the production app and its store listings", () => {
    expect(appVariantFrom(undefined)).toBe("production");
    expect(appVariantFrom("production")).toBe("production");
    expect(appVariantFrom("preview")).toBe("production");
    expect(appLinkFor(undefined)).toBe(APP_LINKS.production);
    expect(APP_LINKS.production.scheme).toBe("theshedmobile");
  });
});

describe("the app's own links and web-only pages", () => {
  test("the app finds its links by its scheme", () => {
    expect(appLinkForScheme("theshedmobilestaging")).toBe(APP_LINKS.staging);
    expect(appLinkForScheme("theshedmobile")).toBe(APP_LINKS.production);
    expect(appLinkForScheme(undefined)).toBe(APP_LINKS.production);
  });

  test("newer pages need a new enough app", () => {
    expect(versionNeededFor("/event-requests")).toBe("2.3.0");
    expect(versionNeededFor("/event-requests/abc/risk?thread=1")).toBe("2.3.0");
    expect(versionNeededFor("/event-requestsx")).toBeNull();
    expect(versionNeededFor("/design-requests/abc")).toBe("2.2.0");
    expect(appCanOpen("/design-requests/abc", null)).toBe(false);
    expect(appCanOpen("/design-requests/abc", "2.1.9")).toBe(false);
    expect(appCanOpen("/design-requests/abc", "2.2.0")).toBe(true);
    expect(versionNeededFor("/churches?church=abc")).toBe("2.5.5");
    expect(appCanOpen("/churches", "2.5.4")).toBe(false);
    expect(versionNeededFor("/request/abc")).toBeNull();
    expect(appCanOpen("/event-requests/abc", null)).toBe(false);
    expect(appCanOpen("/event-requests/abc", "2.2.9")).toBe(false);
    expect(appCanOpen("/event-requests/abc", "2.3.0")).toBe(true);
    expect(appCanOpen("/event-requests/abc", "2.10.0")).toBe(true);
  });

  test("versions", () => {
    expect(compareVersions("2.3.0", "2.3.0")).toBe(0);
    expect(compareVersions("2.3.1", "2.3.0")).toBeGreaterThan(0);
    expect(compareVersions("2.9.0", "2.10.0")).toBeLessThan(0);
    expect(compareVersions("3", "2.99.99")).toBeGreaterThan(0);
    expect(compareVersions("2.3", "2.3.0")).toBe(0);
    expect(isAppVersion("2.3.1")).toBe(true);
    expect(isAppVersion("2.3")).toBe(false);
    expect(isAppVersion("v2.3.1")).toBe(false);
  });

  test("an app below the minimum must update; below the recommended one is nudged", () => {
    const policy = { minimum: "2.8.0", recommended: "2.9.0" };
    expect(updateStatusFor("2.7.9", policy)).toBe("required");
    expect(updateStatusFor("2.8.0", policy)).toBe("recommended");
    expect(updateStatusFor("2.9.0", policy)).toBe("ok");
    expect(updateStatusFor("2.7.0", { recommended: "2.9.0" })).toBe("recommended");
    expect(updateStatusFor("2.7.0", {})).toBe("ok");
    expect(updateStatusFor("2.7.0", null)).toBe("ok");
    expect(updateStatusFor("dev", policy)).toBe("ok");
  });
});
