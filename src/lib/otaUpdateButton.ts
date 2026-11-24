import { type OtaState, updateRouteFor } from "../../shared/appLinks";
import { onRestartFree, restartHeld } from "./restartHold";

export const CHECK_INTERVAL_MS = 15 * 60_000;
export const CHECK_TICK_MS = 60_000;

type UpdateButtonKind = "restart" | "store";
type UpdatePhase = "idle" | "updating" | "ready" | "failed";
type ServerStatus = "ok" | "recommended" | "required" | undefined;

export const updateButtonFor = ({
  dev,
  web,
  ota,
  status,
  latest,
  targetSeenAt,
}: {
  dev: boolean;
  web: boolean;
  ota: OtaState | null;
  status: ServerStatus;
  latest: string | null;
  targetSeenAt: number | null;
}): UpdateButtonKind | null => {
  if (dev || web) return null;
  if (ota?.available) return "restart";
  if (status !== "recommended" && status !== "required") return null;
  return updateRouteFor(latest, ota, targetSeenAt) === "store" ? "store" : null;
};

type BehindSeen = { target: string; at: number };

let behindSeen: BehindSeen | null = null;
const behindListeners = new Set<() => void>();

export const behindKey = (status: ServerStatus, latest: string | null): string | null =>
  status === "recommended" || status === "required" ? `${status} ${latest ?? ""}` : null;

export const noteBehind = (target: string, now: number): void => {
  if (behindSeen?.target === target) return;
  behindSeen = { target, at: now };
  behindListeners.forEach((listener) => listener());
};

export const subscribeBehind = (listener: () => void) => {
  behindListeners.add(listener);
  return () => {
    behindListeners.delete(listener);
  };
};

export const behindSnapshot = (): BehindSeen | null => behindSeen;

export const seenAtFor = (seen: BehindSeen | null, target: string | null): number | null =>
  target !== null && seen?.target === target ? seen.at : null;

export const freshCheckDue = (
  seen: BehindSeen | null,
  askedAt: number | null,
  lastCheckedAt: number | null
): boolean => seen !== null && (askedAt ?? -Infinity) < seen.at && (lastCheckedAt ?? -Infinity) < seen.at;

export const latestOf = (...times: (number | null | undefined)[]): number | null =>
  times.reduce<number | null>((latest, time) => (time == null || (latest !== null && latest >= time) ? latest : time), null);

export const checkDue = (lastCheckedAt: number | null, now: number): boolean =>
  lastCheckedAt === null || now - lastCheckedAt >= CHECK_INTERVAL_MS;

let phase: UpdatePhase = "idle";
const phaseListeners = new Set<() => void>();

const setPhase = (next: UpdatePhase) => {
  phase = next;
  phaseListeners.forEach((listener) => listener());
};

export const subscribeUpdatePhase = (listener: () => void) => {
  phaseListeners.add(listener);
  return () => {
    phaseListeners.delete(listener);
  };
};

export const updatePhase = (): UpdatePhase => phase;

export type UpdateDriver = {
  fetch: () => Promise<boolean>;
  reload: () => Promise<void>;
  isActive: () => boolean;
};

let reloading = false;
let stopWaiting: (() => void) | null = null;

const reload = (driver: UpdateDriver) => {
  if (reloading) return;
  reloading = true;
  stopWaiting?.();
  stopWaiting = null;
  setPhase("updating");
  driver.reload().catch(() => {
    reloading = false;
    setPhase("failed");
  });
};

export const restartWhenFree = (driver: UpdateDriver): void => {
  if (reloading) return;
  if (!restartHeld() && driver.isActive()) {
    reload(driver);
    return;
  }
  setPhase("ready");
  stopWaiting ??= onRestartFree(() => restartWhenFree(driver));
};

const download = (driver: UpdateDriver, then: () => void) => {
  if (reloading || phase === "updating" || phase === "ready") return;
  setPhase("updating");
  driver.fetch().then(
    (fetched) => (fetched ? then() : setPhase("idle")),
    () => setPhase("failed")
  );
};

export const downloadUpdate = (driver: UpdateDriver): void => download(driver, () => restartWhenFree(driver));

export const updateNow = (driver: UpdateDriver, downloaded: boolean): void => {
  if (downloaded) reload(driver);
  else download(driver, () => reload(driver));
};

export const updateButtonState = ({
  kind,
  phase: current,
  downloading,
  downloaded,
}: {
  kind: UpdateButtonKind;
  phase: UpdatePhase;
  downloading: boolean;
  downloaded: boolean;
}): "store" | "update" | "updating" | "ready" | "failed" => {
  if (kind === "store") return "store";
  if (current === "updating" || (downloading && current !== "ready")) return "updating";
  if (current === "failed") return "failed";
  if (current === "ready" || downloaded) return "ready";
  return "update";
};

type UpdateButtonPreview = { kind: UpdateButtonKind; phase: UpdatePhase };

const PREVIEWS = new Map<string, UpdateButtonPreview>([
  ["restart", { kind: "restart", phase: "idle" }],
  ["updating", { kind: "restart", phase: "updating" }],
  ["ready", { kind: "restart", phase: "ready" }],
  ["failed", { kind: "restart", phase: "failed" }],
  ["store", { kind: "store", phase: "idle" }],
]);

export const previewFromSearch = (search: string | undefined): UpdateButtonPreview | null =>
  PREVIEWS.get(new URLSearchParams(search ?? "").get("otaPreview") ?? "") ?? null;

export const startPreview = (preview: UpdateButtonPreview | null): void => {
  if (preview && preview.phase !== "idle") setPhase(preview.phase);
};
