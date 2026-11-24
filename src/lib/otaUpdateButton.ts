import { type OtaState, updateRouteFor } from "../../shared/appLinks";
import { withRestartHeld } from "./restartHold";

export const CHECK_INTERVAL_MS = 15 * 60_000;
export const CHECK_TICK_MS = 60_000;

type UpdateButtonKind = "restart" | "store";
type UpdatePhase = "idle" | "updating" | "failed";
type ServerStatus = "ok" | "recommended" | "required" | undefined;

export const updateButtonFor = ({
  dev,
  web,
  ota,
  status,
  latest,
}: {
  dev: boolean;
  web: boolean;
  ota: OtaState | null;
  status: ServerStatus;
  latest: string | null;
}): UpdateButtonKind | null => {
  if (dev || web) return null;
  if (ota?.available) return "restart";
  if (status !== "recommended" && status !== "required") return null;
  return updateRouteFor(latest, ota) === "store" ? "store" : null;
};

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

export const runUpdate = (restart: () => Promise<void>): void => {
  if (phase === "updating") return;
  setPhase("updating");
  withRestartHeld(restart).catch(() => setPhase("failed"));
};

type UpdateButtonPreview = { kind: UpdateButtonKind; phase: UpdatePhase };

const PREVIEWS = new Map<string, UpdateButtonPreview>([
  ["restart", { kind: "restart", phase: "idle" }],
  ["updating", { kind: "restart", phase: "updating" }],
  ["failed", { kind: "restart", phase: "failed" }],
  ["store", { kind: "store", phase: "idle" }],
]);

export const previewFromSearch = (search: string | undefined): UpdateButtonPreview | null =>
  PREVIEWS.get(new URLSearchParams(search ?? "").get("otaPreview") ?? "") ?? null;

export const startPreview = (preview: UpdateButtonPreview | null): void => {
  if (preview && preview.phase !== "idle") setPhase(preview.phase);
};
