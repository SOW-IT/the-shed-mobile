import { describe, expect, test } from "vitest";
import {
  APP_LINKS,
  appLinkFor,
  appLinkForScheme,
  appCanOpen,
  appVariantFrom,
  compareVersions,
  isAppVersion,
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
    expect(versionNeededFor("/design-requests/abc")).toBeNull();
    expect(appCanOpen("/design-requests/abc", null)).toBe(true);
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
});
