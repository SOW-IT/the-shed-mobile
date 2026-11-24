import { useEffect, useState } from "react";

export const DORMANT_AFTER_MS = 30_000;

type Page = Pick<Document, "hidden" | "addEventListener" | "removeEventListener">;

export const watchHidden = (page: Page, afterMs: number, onDormant: (dormant: boolean) => void) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const changed = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (page.hidden) timer = setTimeout(() => onDormant(true), afterMs);
    else onDormant(false);
  };
  changed();
  page.addEventListener("visibilitychange", changed);
  return () => {
    if (timer !== null) clearTimeout(timer);
    page.removeEventListener("visibilitychange", changed);
  };
};

const pageOrNull = (): Page | null => (typeof document === "undefined" ? null : document);

export const useDormant = () => {
  const [dormant, setDormant] = useState(false);
  useEffect(() => {
    const page = pageOrNull();
    return page ? watchHidden(page, DORMANT_AFTER_MS, setDormant) : undefined;
  }, []);
  return dormant;
};

export const fillLoading = <T>(live: Record<string, T | undefined>, held: Record<string, T | undefined> | undefined): Record<string, T | undefined> => {
  if (!held) return live;
  let filled: Record<string, T | undefined> | null = null;
  for (const key of Object.keys(live)) {
    if (live[key] !== undefined || held[key] === undefined) continue;
    filled ??= { ...live };
    filled[key] = held[key];
  }
  return filled ?? live;
};
