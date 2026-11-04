import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { linkFailureText, mapsLink } from "./externalLinks";
import { openExternalLink } from "./openExternalLink";

const native = vi.hoisted(() => ({
  openURL: vi.fn(),
  alert: vi.fn(),
  openBrowserAsync: vi.fn(),
  platform: { OS: "ios" },
}));

vi.mock("react-native", () => ({
  Alert: { alert: native.alert },
  Linking: { openURL: native.openURL },
  Platform: native.platform,
}));

vi.mock("expo-web-browser", () => ({
  openBrowserAsync: native.openBrowserAsync,
}));

const refused = () => Promise.reject(new Error("Unable to open URL"));

beforeEach(() => {
  native.platform.OS = "ios";
  native.openURL.mockReset();
  native.alert.mockReset();
  native.openBrowserAsync.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openExternalLink", () => {
  test("opens the link and stops there when the phone can open it", async () => {
    native.openURL.mockResolvedValue(true);
    await expect(openExternalLink("https://example.org/church/")).resolves.toBe(true);
    expect(native.openURL).toHaveBeenCalledWith("https://example.org/church/");
    expect(native.openBrowserAsync).not.toHaveBeenCalled();
    expect(native.alert).not.toHaveBeenCalled();
  });

  test("retries a refused web link in the in-app browser", async () => {
    native.openURL.mockImplementation(refused);
    native.openBrowserAsync.mockResolvedValue({ type: "dismiss" });
    await expect(openExternalLink("https://example.org/church/")).resolves.toBe(true);
    expect(native.openBrowserAsync).toHaveBeenCalledWith("https://example.org/church/");
    expect(native.alert).not.toHaveBeenCalled();
  });

  test("opens an address in Google Maps when Apple Maps is refused", async () => {
    native.openURL.mockImplementation(refused);
    native.openBrowserAsync.mockResolvedValue({ type: "dismiss" });
    const { url, ...options } = mapsLink("12 Example Street, Glebe NSW 2037", "ios");
    await expect(openExternalLink(url, options)).resolves.toBe(true);
    expect(native.openURL).toHaveBeenCalledWith(url);
    expect(native.openBrowserAsync).toHaveBeenCalledWith(options.fallbackUrl);
  });

  test("explains what to do when neither the link nor the browser opens", async () => {
    native.openURL.mockImplementation(refused);
    native.openBrowserAsync.mockImplementation(refused);
    const url = "https://example.org/church/";
    await expect(openExternalLink(url)).resolves.toBe(false);
    const { title, message } = linkFailureText(url);
    expect(native.alert).toHaveBeenCalledWith(title, message);
  });

  test("uses the caller's message, and skips the browser for email links", async () => {
    native.openURL.mockImplementation(refused);
    const failure = { title: "Couldn't open Maps", message: "The address is 1 Test Lane." };
    await expect(openExternalLink("mailto:hello@example.org")).resolves.toBe(false);
    expect(native.openBrowserAsync).not.toHaveBeenCalled();
    expect(native.alert).toHaveBeenCalledWith(...Object.values(linkFailureText("mailto:hello@example.org")));
    await expect(openExternalLink("shed-test://x", { failure })).resolves.toBe(false);
    expect(native.alert).toHaveBeenLastCalledWith(failure.title, failure.message);
  });

  test("tells a web user in a browser alert, without an in-app browser", async () => {
    native.platform.OS = "web";
    const alert = vi.fn();
    vi.stubGlobal("window", { alert });
    native.openURL.mockImplementation(refused);
    await expect(openExternalLink("https://example.org/church/")).resolves.toBe(false);
    expect(native.openBrowserAsync).not.toHaveBeenCalled();
    expect(native.alert).not.toHaveBeenCalled();
    const { title, message } = linkFailureText("https://example.org/church/");
    expect(alert).toHaveBeenCalledWith(`${title}\n\n${message}`);
  });
});
