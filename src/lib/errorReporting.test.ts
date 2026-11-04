import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { STALE_RELOAD_KEY } from "./staleRelease";

const env = vi.hoisted(() => ({ platform: { OS: "web" } }));

vi.mock("react-native", () => ({ Platform: env.platform }));
vi.mock("@/hooks/useReportAppVersion", () => ({ appVersion: () => "2.10.25" }));

type Listener = (event: Record<string, unknown>) => void;
type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

const chunk = "https://theshed.sow.org.au/_expo/static/js/web/org-645bdadb.js";

const chunkFailed = () => {
  const error = new Error(`Loading module ${chunk} failed.\n(error: ${chunk})`);
  error.name = "AsyncRequireError";
  return error;
};

const setUp = async ({ os = "web", sessionAt }: { os?: string; sessionAt?: string } = {}) => {
  vi.resetModules();
  env.platform.OS = os;
  const listeners: Record<string, Listener> = {};
  const storage = new Map<string, string>(sessionAt ? [[STALE_RELOAD_KEY, sessionAt]] : []);
  const reload = vi.fn();
  const previous = vi.fn();
  let handler: GlobalHandler = previous;
  let onUnhandled: ((id: number, error: unknown) => void) | null = null;
  vi.stubGlobal("__DEV__", false);
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("ErrorUtils", {
    getGlobalHandler: () => handler,
    setGlobalHandler: (next: GlobalHandler) => {
      handler = next;
    },
  });
  vi.stubGlobal("HermesInternal", {
    enablePromiseRejectionTracker: (options: { onUnhandled: (id: number, error: unknown) => void }) => {
      onUnhandled = options.onUnhandled;
    },
  });
  vi.stubGlobal("window", {
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener;
    },
    location: { reload },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
  });
  const reporting = await import("./errorReporting");
  const reports: { message: string; platform: string }[] = [];
  reporting.setErrorReporter(async (report) => {
    reports.push(report);
  });
  return {
    reports,
    reload,
    previous,
    storage,
    fatal: (error: unknown) => handler(error, true),
    rejection: (reason: unknown) => listeners.unhandledrejection?.({ reason }),
    scriptError: (event: Record<string, unknown>) => listeners.error?.(event),
    hermes: (error: unknown) => onUnhandled?.(1, error),
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(5_000_000);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("web global handlers", () => {
  test("ignore Expo's synchronous first try at a route but still pass it on", async () => {
    const app = await setUp();
    const miss = new Error('Requiring unknown module "1669".');
    app.fatal(miss);
    expect(app.reports).toEqual([]);
    expect(app.previous).toHaveBeenCalledWith(miss, true);
    app.fatal(new Error("Cannot read properties of undefined"));
    expect(app.reports.map((r) => r.message)).toEqual(["Cannot read properties of undefined"]);
  });

  test("drop network failures and keep real rejections", async () => {
    const app = await setUp();
    app.rejection(new TypeError("Failed to fetch"));
    app.rejection(new TypeError("A network error occurred."));
    app.rejection(new Error("Something broke"));
    expect(app.reports.map((r) => r.message)).toEqual(["Something broke"]);
  });

  test("reload once, without reporting, when a chunk comes back as the HTML page", async () => {
    const app = await setUp();
    app.scriptError({ message: "Uncaught SyntaxError: Unexpected token '<'", filename: chunk });
    app.rejection(chunkFailed());
    expect(app.reload).toHaveBeenCalledTimes(1);
    expect(app.storage.get(STALE_RELOAD_KEY)).toBe("5000000");
    expect(app.reports).toEqual([]);
  });

  test("report a chunk that still fails within a minute of the reload", async () => {
    const app = await setUp({ sessionAt: String(5_000_000 - 10_000) });
    app.rejection(chunkFailed());
    app.scriptError({ message: "Uncaught SyntaxError: Unexpected token '<'", filename: chunk, error: new SyntaxError("Unexpected token '<'") });
    expect(app.reload).not.toHaveBeenCalled();
    expect(app.reports.map((r) => r.message)).toEqual([chunkFailed().message, "Unexpected token '<'"]);
  });

  test("reload, without reporting, when a chunk failure reaches the fatal handler", async () => {
    const app = await setUp();
    const failure = chunkFailed();
    app.fatal(failure);
    expect(app.reload).toHaveBeenCalledTimes(1);
    expect(app.reports).toEqual([]);
    expect(app.previous).toHaveBeenCalledWith(failure, true);
  });

  test("report a fatal chunk failure and pass it on when the reload itself throws", async () => {
    const app = await setUp();
    app.reload.mockImplementation(() => {
      throw new Error("reload blocked");
    });
    const failure = chunkFailed();
    app.fatal(failure);
    expect(app.reload).toHaveBeenCalledTimes(1);
    expect(app.reports.map((r) => r.message)).toEqual([failure.message]);
    expect(app.previous).toHaveBeenCalledWith(failure, true);
  });

  test("report a fatal chunk failure within a minute of a reload", async () => {
    const app = await setUp({ sessionAt: String(5_000_000 - 10_000) });
    app.fatal(chunkFailed());
    expect(app.reload).not.toHaveBeenCalled();
    expect(app.reports.map((r) => r.message)).toEqual([chunkFailed().message]);
  });

  test("report other script errors as before", async () => {
    const app = await setUp();
    app.scriptError({ message: "Uncaught TypeError: x is not a function", filename: chunk, error: new TypeError("x is not a function") });
    expect(app.reload).not.toHaveBeenCalled();
    expect(app.reports.map((r) => r.message)).toEqual(["x is not a function"]);
  });
});

describe("native global handlers", () => {
  test("report a missing module and never try to reload", async () => {
    const app = await setUp({ os: "ios" });
    app.fatal(new Error('Requiring unknown module "12".'));
    app.hermes(chunkFailed());
    app.fatal(new Error("Loading module https://x/_expo/static/js/ios/a.js failed."));
    expect(app.reload).not.toHaveBeenCalled();
    expect(app.reports.map((r) => r.message)).toEqual([
      'Requiring unknown module "12".',
      chunkFailed().message,
      "Loading module https://x/_expo/static/js/ios/a.js failed.",
    ]);
    expect(app.reports.every((r) => r.platform === "ios")).toBe(true);
  });

  test("drop a dropped connection from an unhandled rejection", async () => {
    const app = await setUp({ os: "ios" });
    app.hermes(new Error("fetch failed: The network connection was lost."));
    app.hermes(new Error("Unexpected end of JSON input"));
    expect(app.reports.map((r) => r.message)).toEqual(["Unexpected end of JSON input"]);
  });
});
