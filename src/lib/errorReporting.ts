import { Platform } from "react-native";
import { appVersion } from "@/hooks/useReportAppVersion";

type ErrorReport = {
  message: string;
  stack?: string;
  route?: string;
  platform: string;
  version?: string;
};

type Reporter = (report: ErrorReport) => Promise<unknown>;

let reporter: Reporter | null = null;
let currentRoute: string | undefined;
let installed = false;
const queue: ErrorReport[] = [];
const recent = new Map<string, number>();
const QUEUE_LIMIT = 5;
const SAME_ERROR_GAP_MS = 10_000;

export const setCurrentRoute = (route: string | undefined) => {
  currentRoute = route;
};

const describe = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: error.message || error.name || "Error", stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  try {
    return { message: JSON.stringify(error).slice(0, 500) };
  } catch {
    return { message: String(error) };
  }
};

const send = (report: ErrorReport) => {
  const key = `${report.message}|${report.route ?? ""}`;
  const last = recent.get(key);
  const now = Date.now();
  if (last !== undefined && now - last < SAME_ERROR_GAP_MS) return;
  recent.set(key, now);
  if (!reporter) {
    if (queue.length < QUEUE_LIMIT) queue.push(report);
    return;
  }
  void reporter(report).catch(() => {});
};

export const reportError = (error: unknown, componentStack?: string | null) => {
  const { message, stack } = describe(error);
  const fullStack = [stack, componentStack ? `Component stack:${componentStack}` : null]
    .filter(Boolean)
    .join("\n");
  send({
    message,
    stack: fullStack || undefined,
    route: currentRoute,
    platform: Platform.OS,
    version: appVersion(),
  });
};

type GlobalWithErrorUtils = typeof globalThis & {
  ErrorUtils?: {
    getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
    setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
  };
  HermesInternal?: {
    enablePromiseRejectionTracker?: (options: {
      allRejections: boolean;
      onUnhandled: (id: number, error: unknown) => void;
    }) => void;
  };
};

const installGlobalHandlers = () => {
  if (installed) return;
  installed = true;
  const runtime = globalThis as GlobalWithErrorUtils;
  if (Platform.OS !== "web" && !__DEV__) {
    runtime.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id, error) => reportError(error),
    });
  }
  const errorUtils = runtime.ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error);
      previous?.(error, isFatal);
    });
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("error", (event) => reportError(event.error ?? event.message));
    window.addEventListener("unhandledrejection", (event) => reportError(event.reason));
  }
};

export const setErrorReporter = (next: Reporter | null) => {
  reporter = next;
  if (!next) return;
  installGlobalHandlers();
  while (queue.length > 0) {
    const report = queue.shift();
    if (report) void next(report).catch(() => {});
  }
};
