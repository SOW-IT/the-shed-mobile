// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import * as Haptics from "expo-haptics";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Animated, Platform } from "react-native";
import { USE_NATIVE_DRIVER } from "@/theme";

// Haptics are intentionally reserved for the bottom navigation bar only (see
// _layout.tsx). Exported so that single caller can use the same helper; no
// other button in the app triggers haptics.
export const hapticSelect = () => {
  if (Platform.OS === "web") return;
  void Haptics.selectionAsync();
};

/**
 * Shared press feedback: the element shrinks slightly while touched (and held)
 * and springs back on release. Returns the animated scale plus the press
 * handlers to spread onto a Pressable. Used everywhere for a consistent feel
 * (matching the "Make Request" footer button).
 */
export const usePressScale = (pressedScale = 0.96) => {
  const [scale] = useState(() => new Animated.Value(1));
  const onPressIn = () =>
    Animated.spring(scale, {
      toValue: pressedScale,
      useNativeDriver: USE_NATIVE_DRIVER,
      speed: 50,
      bounciness: 0,
    }).start();
  const onPressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: USE_NATIVE_DRIVER,
      speed: 20,
      bounciness: 6,
    }).start();
  return { scale, onPressIn, onPressOut };
};

export const errorMessage = (e: unknown): string =>
  e instanceof ConvexError
    ? String(e.data)
    : e instanceof Error
      ? e.message
      : "Something went wrong";

/** Maximum size (in bytes) for any uploaded file — profile photos and receipts. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Keeps only digits — for BSB / account number inputs. */
export const digitsOnly = (text: string): string => text.replace(/[^0-9]/g, "");

/** Masks an account number to its last 4 digits (e.g. ••1234). */
export const maskAccount = (accountNumber: string): string =>
  accountNumber.length > 4 ? `••${accountNumber.slice(-4)}` : accountNumber;

/** Keeps digits and a single decimal point, capped at 2 fractional digits —
 *  for $ amount inputs (dollars and cents). A trailing point is preserved while
 *  typing (e.g. "12." stays "12." so the next keystroke lands after the dot). */
export const currencyText = (text: string): string => {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, "").split(".");
  if (rest.length === 0) return whole;
  const cents = rest.join("").slice(0, 2);
  return `${whole}.${cents}`;
};

/** Formats a $ amount for display. A whole-dollar value stays bare ("12"), but
 *  any value with cents is shown to exactly 2 decimals ("12.5" → "12.50") so
 *  amounts don't read as a stray single-digit cents figure. */
export const formatAmount = (amount: number): string =>
  Number.isInteger(amount) ? String(amount) : amount.toFixed(2);

/** Stagger helper: caps the cascade so long lists don't feel sluggish. Kept
 *  short (per-item + total cap) so lists snap in rather than trickle. */
export const stagger = (index: number): number => Math.min(index, 8) * 24;
