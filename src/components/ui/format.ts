import * as Haptics from "expo-haptics";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { Animated, Platform } from "react-native";
import { USE_NATIVE_DRIVER } from "@/theme";

export const hapticSelect = () => {
  if (Platform.OS === "web") return;
  void Haptics.selectionAsync();
};

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

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export const digitsOnly = (text: string): string => text.replace(/[^0-9]/g, "");

export const maskAccount = (accountNumber: string): string =>
  accountNumber.length > 4 ? `••${accountNumber.slice(-4)}` : accountNumber;

export { currencyText, formatAmount } from "@shared/money";

export const stagger = (index: number): number => Math.min(index, 8) * 24;
