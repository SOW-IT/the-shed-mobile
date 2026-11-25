import { atSwipeEdge } from "@/lib/games/leave";
import { useEffect } from "react";
import { Platform } from "react-native";

const guard = { owners: 0, before: [] as string[] };

const pagesOf = () => [document.documentElement, document.body];

const onTouchStart = (event: TouchEvent) => {
  const touch = event.touches[0];
  if (!touch || !atSwipeEdge(touch.clientX, window.innerWidth)) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('button, a, [role="button"]')) return;
  event.preventDefault();
};

const take = () => {
  guard.owners += 1;
  if (guard.owners > 1) return;
  const pages = pagesOf();
  guard.before = pages.map((page) => page.style.overscrollBehaviorX);
  for (const page of pages) page.style.overscrollBehaviorX = "none";
  document.addEventListener("touchstart", onTouchStart, { passive: false });
};

const release = () => {
  guard.owners = Math.max(0, guard.owners - 1);
  if (guard.owners > 0) return;
  document.removeEventListener("touchstart", onTouchStart);
  pagesOf().forEach((page, i) => {
    page.style.overscrollBehaviorX = guard.before[i] ?? "";
  });
};

/**
 * On web, keeps the browser's own swipe back and forward off a game: a
 * sideways swipe is a move in the game, and the way out is the back button.
 * The trackpad's two-finger swipe stops at the page, and a touch that starts
 * at the screen's edge (where a phone's browser starts its swipe back) is
 * kept from the browser. A touch on a button there still presses it.
 */
export const useNoSwipeBack = (enabled = true) => {
  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof document === "undefined") return;
    take();
    return release;
  }, [enabled]);
};
