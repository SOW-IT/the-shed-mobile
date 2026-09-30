import { describe, expect, test } from "vitest";
import { APP_LINKS, appLinkFor, appVariantFrom } from "./appLinks";

describe("appLinks", () => {
  test("the dev web hands over to the staging app, with no store to fall back to", () => {
    expect(appVariantFrom("staging")).toBe("staging");
    expect(appVariantFrom(" Staging ")).toBe("staging");
    expect(appLinkFor("staging")).toEqual({
      scheme: "theshedmobilestaging",
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
