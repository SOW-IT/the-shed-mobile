import { atSwipeEdge } from "@/lib/games/leave";
import { useEffect } from "react";
import { Platform } from "react-native";

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
    const pages = [document.documentElement, document.body];
    const before = pages.map((page) => page.style.overscrollBehaviorX);
    for (const page of pages) page.style.overscrollBehaviorX = "none";
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || !atSwipeEdge(touch.clientX, window.innerWidth)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('button, a, [role="button"]')) return;
      event.preventDefault();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      pages.forEach((page, i) => {
        page.style.overscrollBehaviorX = before[i];
      });
    };
  }, [enabled]);
};
