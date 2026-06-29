// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Animated, Image, Text, View } from "react-native";
import { USE_NATIVE_DRIVER, typography, useAppTheme } from "@/theme";
import { FadeInView, SowSpinner } from "./primitives";
import { styles } from "./styles";

/**
 * A short-lived confirmation bubble. Pass a fresh object each time
 * (`setToast({ text: "Saved" })`) so repeating the same message re-shows it.
 */
export type ToastState = { text: string } | null;

export const Toast = ({ toast }: { toast: ToastState }) => {
  const t = useAppTheme();
  const [opacity] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(8));
  const [shown, setShown] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    // Capture the toast into state so it stays rendered through the fade-out
    // after the prop clears; the run-once animation makes this stateful.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- drives the show animation
    setShown(toast);
    opacity.setValue(0);
    lift.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.spring(lift, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, damping: 18, stiffness: 240 }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(() => setShown(null));
    }, 2000);
    return () => clearTimeout(timer);
  }, [toast, opacity, lift]);
  if (!shown) return null;
  return (
    <Animated.View
      style={[
        styles.toast,
        t.shadowFloat,
        { backgroundColor: t.text, opacity, transform: [{ translateY: lift }], pointerEvents: "none" },
      ]}
    >
      <Ionicons name="checkmark-circle" size={16} color={t.background} />
      <Text style={[styles.toastText, { color: t.background }]}>{shown.text}</Text>
    </Animated.View>
  );
};

export const ErrorBanner = ({ message }: { message: string | null }) => {
  const t = useAppTheme();
  return message ? (
    <View style={[styles.error, { backgroundColor: t.errorBackground }]}>
      <Ionicons name="alert-circle" size={16} color={t.errorText} />
      <Text style={[typography.caption, { color: t.errorText, flex: 1 }]}>{message}</Text>
    </View>
  ) : null;
};

/** An amber advisory banner — for non-error notices the user should heed. */
export const WarningBanner = ({ message }: { message: string | null }) => {
  const t = useAppTheme();
  return message ? (
    <View style={[styles.error, { backgroundColor: t.warningSoft }]}>
      <Ionicons name="warning-outline" size={16} color={t.warning} />
      <Text style={[typography.caption, { color: t.warning, flex: 1 }]}>{message}</Text>
    </View>
  ) : null;
};

/** Friendly centred state for empty lists and loading screens. */
export const EmptyState = ({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
}) => {
  const t = useAppTheme();
  return (
    <FadeInView>
      <View style={styles.empty}>
        <View style={[styles.emptyIcon, { backgroundColor: t.primarySoft }]}>
          <Ionicons name={icon} size={26} color={t.dark ? t.text : t.primary} />
        </View>
        <Text style={[typography.headline, { color: t.text, textAlign: "center" }]}>
          {title}
        </Text>
        {message ? (
          <Text style={[typography.caption, styles.emptyMessage, { color: t.muted }]}>
            {message}
          </Text>
        ) : null}
      </View>
    </FadeInView>
  );
};

/** Centred loading indicator for screens waiting on their first query. */
export const LoadingState = () => (
  <View style={styles.loading}>
    <SowSpinner />
  </View>
);

/** Round profile photo with an initials fallback. */
export const Avatar = ({
  photo,
  name,
  size = 40,
}: {
  photo: string | null;
  name: string | null;
  size?: number;
}) => {
  const t = useAppTheme();
  const round = { width: size, height: size, borderRadius: size / 2 };
  if (photo) {
    return <Image source={{ uri: photo }} style={round} />;
  }
  const initials = (name ?? "?")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View style={[round, styles.avatarFallback, { backgroundColor: t.primarySoft }]}>
      <Text
        style={{
          color: t.dark ? t.text : t.primary,
          fontWeight: "800",
          fontSize: size / 3,
        }}
      >
        {initials}
      </Text>
    </View>
  );
};
