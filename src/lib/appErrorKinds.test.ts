import { describe, expect, test } from "vitest";
import {
  friendlyErrorText,
  isChunkLoadError,
  isNetworkError,
  isStaleReleaseError,
  isStaleScriptError,
  isUnknownModuleError,
  NETWORK_ERROR_TEXT,
  RELOAD_NEEDED_TEXT,
} from "./appErrorKinds";

const asyncRequireError = (url: string) => {
  const error = new Error(`Loading module ${url} failed.\n(error: ${url})`);
  error.name = "AsyncRequireError";
  return error;
};

describe("isUnknownModuleError", () => {
  test("matches Metro's missing-module error", () => {
    expect(isUnknownModuleError(new Error('Requiring unknown module "1669".'))).toBe(true);
    expect(isUnknownModuleError('Requiring unknown module "754".')).toBe(true);
  });

  test("ignores other errors", () => {
    expect(isUnknownModuleError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isUnknownModuleError(null)).toBe(false);
    expect(isUnknownModuleError({ message: 42 })).toBe(false);
  });
});

describe("isChunkLoadError", () => {
  test("matches a route chunk that failed to load", () => {
    expect(isChunkLoadError(asyncRequireError("//theshed.sow.org.au/_expo/static/js/web/home-abc.js"))).toBe(true);
    expect(
      isChunkLoadError(new Error("Loading module //x/_expo/static/js/web/org-1.js failed.\n(missing: x)"))
    ).toBe(true);
    expect(isChunkLoadError({ name: "AsyncRequireError", message: "" })).toBe(true);
  });

  test("matches a chunk that loaded but never registered its modules", () => {
    expect(
      isChunkLoadError(
        new Error("Chunk https://x/_expo/static/js/web/a.js did not finish registering its modules. Check the console.")
      )
    ).toBe(true);
  });

  test("ignores ordinary failures", () => {
    expect(isChunkLoadError(new Error("Loading module failed"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("isStaleReleaseError", () => {
  test("covers both a missing chunk and a missing module", () => {
    expect(isStaleReleaseError(asyncRequireError("/_expo/static/js/web/a.js"))).toBe(true);
    expect(isStaleReleaseError(new Error('Requiring unknown module "1".'))).toBe(true);
    expect(isStaleReleaseError(new Error("Something else"))).toBe(false);
  });
});

describe("isStaleScriptError", () => {
  const chunk = "https://theshed.sow.org.au/_expo/static/js/web/home-3b7d.js";

  test("matches the page HTML served in place of a chunk, in each browser's words", () => {
    expect(isStaleScriptError({ message: "Uncaught SyntaxError: Unexpected token '<'", filename: chunk })).toBe(true);
    expect(isStaleScriptError({ message: "SyntaxError: expected expression, got '<'", filename: chunk })).toBe(true);
    expect(
      isStaleScriptError({ message: "", filename: chunk, error: new SyntaxError("Unexpected token '<'") })
    ).toBe(true);
    expect(isStaleScriptError({ message: "SyntaxError: Unexpected token <", filename: chunk })).toBe(true);
  });

  test("ignores the same error from anything but one of our chunks", () => {
    expect(
      isStaleScriptError({ message: "Uncaught SyntaxError: Unexpected token '<'", filename: "https://maps.googleapis.com/x.js" })
    ).toBe(false);
    expect(isStaleScriptError({ message: "Uncaught SyntaxError: Unexpected token '<'" })).toBe(false);
  });

  test("ignores other errors from our chunks", () => {
    expect(isStaleScriptError({ message: "TypeError: x is not a function", filename: chunk })).toBe(false);
  });
});

describe("isNetworkError", () => {
  test("matches the browsers' and native fetch's network failures", () => {
    for (const message of [
      "Failed to fetch",
      "Failed to fetch (theshed.sow.org.au)",
      "Load failed",
      "NetworkError when attempting to fetch resource.",
      "Network request failed",
      "A network error occurred.",
      "fetch failed: The network connection was lost.",
      "fetch failed: The Internet connection appears to be offline.",
      "fetch failed: The request timed out.",
    ]) {
      expect(isNetworkError(new TypeError(message)), message).toBe(true);
    }
    expect(isNetworkError("Failed to fetch")).toBe(true);
  });

  test("keeps real errors, including ones that mention fetch", () => {
    expect(isNetworkError(new Error("fetch failed: Invalid URL"))).toBe(false);
    expect(isNetworkError(new Error("Failed to fetch the receipt list"))).toBe(false);
    expect(isNetworkError(new Error("Unauthorized"))).toBe(false);
    expect(isNetworkError(new Error(""))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("friendlyErrorText", () => {
  test("explains a network failure and a page that needs a reload in plain words", () => {
    expect(friendlyErrorText(new TypeError("Failed to fetch"))).toBe(NETWORK_ERROR_TEXT);
    expect(friendlyErrorText(asyncRequireError("/_expo/static/js/web/a.js"))).toBe(RELOAD_NEEDED_TEXT);
  });

  test("leaves every other error to the caller", () => {
    expect(friendlyErrorText(new Error("You can't edit this request"))).toBeNull();
  });
});
