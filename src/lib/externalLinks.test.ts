import { describe, expect, test } from "vitest";
import { browserFallbackFor, googleMapsUrl, linkFailureText, mapsLink } from "./externalLinks";

const ADDRESS = "12 Example Street, Glebe NSW 2037";

describe("mapsLink", () => {
  test("opens Apple Maps on iOS and falls back to Google Maps in the browser", () => {
    const link = mapsLink(ADDRESS, "ios");
    expect(link.url).toBe("https://maps.apple.com/?q=12%20Example%20Street%2C%20Glebe%20NSW%202037");
    expect(link.fallbackUrl).toBe(googleMapsUrl(ADDRESS));
    expect(link.failure).toEqual({ title: "Couldn't open Maps", message: `The address is ${ADDRESS}.` });
  });

  test("opens Google Maps everywhere else", () => {
    for (const os of ["android", "web"]) {
      const link = mapsLink(ADDRESS, os);
      expect(link.url).toBe(
        "https://www.google.com/maps/search/?api=1&query=12%20Example%20Street%2C%20Glebe%20NSW%202037"
      );
      expect(link.fallbackUrl).toBe(link.url);
    }
  });
});

describe("browserFallbackFor", () => {
  test("retries a web link in the in-app browser", () => {
    expect(browserFallbackFor("https://example.org/church/")).toBe("https://example.org/church/");
    expect(browserFallbackFor("https://maps.apple.com/?q=x", "https://www.google.com/maps/search/?api=1&query=x")).toBe(
      "https://www.google.com/maps/search/?api=1&query=x"
    );
  });

  test("has no browser fallback for email, phone or store links", () => {
    expect(browserFallbackFor("mailto:hello@sow.org.au")).toBeNull();
    expect(browserFallbackFor("tel:131114")).toBeNull();
    expect(browserFallbackFor("itms-apps://apps.apple.com/app/id1")).toBeNull();
  });
});

describe("linkFailureText", () => {
  test("names the site so it can be opened by hand", () => {
    expect(linkFailureText("https://example.org/church/")).toEqual({
      title: "Couldn't open this link",
      message: "Try again, or open example.org/church in your browser.",
    });
    expect(linkFailureText("https://www.instagram.com/harbourcity/").message).toBe(
      "Try again, or open instagram.com/harbourcity in your browser."
    );
  });

  test("gives the address or number for email and phone links", () => {
    expect(linkFailureText("mailto:hello%40sow.org.au?subject=Hi")).toEqual({
      title: "Couldn't open your email app",
      message: "You can email hello@sow.org.au from another app.",
    });
    expect(linkFailureText("mailto:").message).toBe("Try again from another app.");
    expect(linkFailureText("mailto:%E0%A4%A").message).toBe("You can email %E0%A4%A from another app.");
    expect(linkFailureText("tel:131114")).toEqual({
      title: "Couldn't start a call",
      message: "You can call 131114 from your phone app.",
    });
  });

  test("still says something for links it can't read", () => {
    expect(linkFailureText("itms-apps://apps.apple.com/app/id1").message).toBe(
      "Try again, or open it on another device."
    );
    expect(linkFailureText("https://").message).toBe("Try again, or open https:// in your browser.");
  });
});
