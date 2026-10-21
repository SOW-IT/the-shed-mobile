import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  APP_LINKS,
  appLinkFor,
  appLinkForScheme,
  appCanOpen,
  appVariantFrom,
  compareVersions,
  isAppVersion,
  NEWER_PAGES,
  searchWithoutSignInParams,
  updateStatusFor,
  versionNeededFor,
  WEB_ONLY_MARKER,
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
    const pages = [
      { prefix: "/design-requests", since: "2.2.0" },
      { prefix: "/event-requests", since: "2.3.0" },
      { prefix: "/churches", since: "2.5.5" },
    ];
    expect(versionNeededFor("/event-requests", pages)).toBe("2.3.0");
    expect(versionNeededFor("/event-requests/abc/risk?thread=1", pages)).toBe("2.3.0");
    expect(versionNeededFor("/event-requestsx", pages)).toBeNull();
    expect(versionNeededFor("/design-requests/abc", pages)).toBe("2.2.0");
    expect(appCanOpen("/design-requests/abc", null, pages)).toBe(false);
    expect(appCanOpen("/design-requests/abc", "2.1.9", pages)).toBe(false);
    expect(appCanOpen("/design-requests/abc", "2.2.0", pages)).toBe(true);
    expect(versionNeededFor("/churches?church=abc", pages)).toBe("2.5.5");
    expect(appCanOpen("/churches", "2.5.4", pages)).toBe(false);
    expect(versionNeededFor("/request/abc", pages)).toBeNull();
    expect(appCanOpen("/event-requests/abc", null, pages)).toBe(false);
    expect(appCanOpen("/event-requests/abc", "2.2.9", pages)).toBe(false);
    expect(appCanOpen("/event-requests/abc", "2.3.0", pages)).toBe(true);
    expect(appCanOpen("/event-requests/abc", "2.10.0", pages)).toBe(true);
  });

  test("every supported app opens every page except self check-in, which stays in the browser", () => {
    expect(NEWER_PAGES).toEqual([{ prefix: "/checkin", since: "2.9.19" }]);
    expect(versionNeededFor("/checkin/abc")).toBe("2.9.19");
    expect(appCanOpen("/checkin/abc", "2.9.18")).toBe(false);
    expect(versionNeededFor("/event-requests/abc")).toBeNull();
    expect(versionNeededFor("/churches?church=abc")).toBeNull();
    expect(appCanOpen("/announcements/abc", null)).toBe(true);
    expect(appCanOpen("/design-requests/abc", "2.1.9")).toBe(true);
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

describe("links surviving a web sign-in", () => {
  test("keeps the link's own query and drops what the sign-in hands back", () => {
    expect(searchWithoutSignInParams("?tab=review&focus=abc&thread=1&code=123")).toBe(
      "?tab=review&focus=abc&thread=1"
    );
    expect(searchWithoutSignInParams("?code=123&state=x&scope=email&authuser=0&prompt=none&hd=sow.org.au")).toBe("");
    expect(searchWithoutSignInParams("?error=access_denied&error_description=no&id=7")).toBe("?id=7");
    expect(searchWithoutSignInParams("")).toBe("");
  });
});

const associationFile = (folder: string, name: string) =>
  JSON.parse(readFileSync(new URL(`../${folder}/.well-known/${name}`, import.meta.url), "utf8"));

const webOnly = [
  { "#": WEB_ONLY_MARKER.slice(1), exclude: true },
  { "?": { code: "?*" }, exclude: true },
];

describe.each([
  ["web", "au.org.sow.theshed"],
  ["web-dev", "au.org.sow.theshed.staging"],
])("association files served by %s", (folder, appId) => {
  test("iOS hands every page to the app except no-app links and web sign-in returns", () => {
    const [details] = associationFile(folder, "apple-app-site-association").applinks.details;
    expect(details.appIDs).toEqual([`4FH642K7X2.${appId}`]);
    expect(details.components).toEqual([...webOnly, { "/": "/*" }]);
  });

  test("Android trusts real signing keys and skips the same links from Android 15", () => {
    const [statement] = associationFile(folder, "assetlinks.json");
    expect(statement.target.package_name).toBe(appId);
    expect(statement.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
    for (const fingerprint of statement.target.sha256_cert_fingerprints) {
      expect(fingerprint).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    }
    expect(
      statement.relation_extensions["delegate_permission/common.handle_all_urls"].dynamic_app_link_components
    ).toEqual([...webOnly, { "/": "*" }]);
  });
});
