// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Animated, Easing, Keyboard, Platform, Pressable, Text, View } from "react-native";
import { USE_NATIVE_DRIVER, radius, spacing, typography, useAppTheme } from "@/theme";
import { usePressScale } from "./format";
import { SowSpinner } from "./primitives";
import { styles } from "./styles";

// iOS keyboard animation curve. Animated.timing's default ease-in-out starts
// slowly, so even with the keyboard's own duration the footer visibly lagged a
// beat behind it. This front-loaded curve (fast out, ease into place) tracks the
// keyboard, so the bar rises with it at the same speed.
const KEYBOARD_EASING = Easing.bezier(0.38, 0.7, 0.125, 1);

// Run the lift quicker than the keyboard's own animation so the footer snaps
// between its down/up positions instead of gliding the full keyboard duration.
const KEYBOARD_LIFT_DURATION_SCALE = 0.6;

const liftDuration = (keyboardDuration: number | undefined) =>
  // `??` not `||`: iOS may report a real duration of 0 (no animation), which
  // should stay 0, not fall back to 250ms.
  Math.round((keyboardDuration ?? 250) * KEYBOARD_LIFT_DURATION_SCALE);

/** Floating full-width pill action pinned above the tab bar. */
export const FooterAction = ({
  title,
  onPress,
  disabled,
  onInfo,
  note,
  cancel,
  bottomOffset = 0,
  avoidKeyboard = true,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** Optional info icon button rendered to the left of the main pill. */
  onInfo?: () => void;
  /** Optional advisory text shown in the warning colour above the pill. */
  note?: string | null;
  /** Optional secondary (Cancel) button rendered to the left, sharing width. */
  cancel?: { onPress: () => void; disabled?: boolean; title?: string };
  /**
   * Extra px to raise the footer above its default bottom gap. Used on screens
   * without a bottom tab bar (e.g. the event attendance page) so the pill clears
   * the home indicator and sits a little higher instead of hugging the edge.
   */
  bottomOffset?: number;
  /** Whether this footer should lift above the software keyboard when shown. */
  avoidKeyboard?: boolean;
}) => {
  const t = useAppTheme();
  const [scale] = useState(() => new Animated.Value(1));
  // Lifts the pinned footer above the software keyboard. Screens may rest the
  // footer higher than usual, but keyboard-up placement keeps the app's normal
  // gap above the keyboard by subtracting that resting offset from the lift.
  const [lift] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const keyboardLift = (height: number) => Math.max(0, height - bottomOffset);
    if (!avoidKeyboard) {
      lift.setValue(0);
      return;
    }
    if (Platform.OS !== "ios") return;
    // On iOS, the footer can mount while the keyboard is already open (e.g. the
    // Create action appears mid-search), and no willShow fires for it — so seed
    // the lift from the live keyboard metrics, otherwise it sits under the
    // keyboard until the next hide/show cycle.
    if (Keyboard.isVisible()) {
      const metrics = Keyboard.metrics();
      if (metrics) lift.setValue(keyboardLift(metrics.height));
    }
    const show = Keyboard.addListener("keyboardWillShow", (e) => {
      Animated.timing(lift, {
        toValue: keyboardLift(e.endCoordinates.height),
        duration: liftDuration(e.duration),
        easing: KEYBOARD_EASING,
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener("keyboardWillHide", (e) => {
      Animated.timing(lift, {
        toValue: 0,
        duration: liftDuration(e?.duration),
        easing: KEYBOARD_EASING,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [avoidKeyboard, bottomOffset, lift]);
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.footerWrap,
        bottomOffset ? { bottom: spacing.md + bottomOffset } : null,
        { transform: [{ translateY: Animated.multiply(lift, -1) }] },
      ]}
    >
      {note ? (
        <View style={styles.footerNote} pointerEvents="none">
          <Ionicons name="warning-outline" size={14} color={t.warning} />
          <Text style={[typography.caption, { color: t.warning, fontWeight: "700" }]}>
            {note}
          </Text>
        </View>
      ) : null}
      <View style={styles.footerRow}>
        {onInfo && (
          <Pressable
            onPress={onInfo}
            style={[styles.footerInfoBtn, { backgroundColor: t.card }, t.shadowFloat]}
          >
            <Ionicons name="information-circle-outline" size={22} color={t.primary} />
          </Pressable>
        )}
        {cancel ? (
          <View
            style={[
              { flex: 1, borderRadius: radius.lg - 2 },
              t.shadowFloat,
            ]}
          >
            <Pressable
              onPress={cancel.onPress}
              disabled={cancel.disabled}
              style={({ pressed }) => [
                styles.footerAction,
                { backgroundColor: t.card, borderWidth: 1.5, borderColor: t.border },
                pressed && !cancel.disabled && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.footerActionText, { color: t.text }]}>
                {cancel.title ?? "Cancel"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {/* Match the pill's radius so the shadow container's corners don't
            show through behind the rounded button (visible on web). */}
        <Animated.View
          style={[
            { flex: 1, borderRadius: radius.lg - 2, transform: [{ scale }] },
            t.shadowFloat,
          ]}
        >
          <Pressable
            onPress={onPress}
            onPressIn={() =>
              Animated.spring(scale, { toValue: 0.97, useNativeDriver: USE_NATIVE_DRIVER, speed: 50, bounciness: 0 }).start()
            }
            onPressOut={() =>
              Animated.spring(scale, { toValue: 1, useNativeDriver: USE_NATIVE_DRIVER, speed: 20, bounciness: 6 }).start()
            }
            disabled={disabled}
            style={[
              styles.footerAction,
              { backgroundColor: t.primary },
            ]}
          >
            <Text style={[styles.footerActionText, { color: t.onPrimary }]}>{title}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.View>
  );
};

export const Btn = ({
  title,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost" | "success" | "tonal";
  disabled?: boolean;
  /** Shows a spinner in place of the label and disables the button. */
  loading?: boolean;
}) => {
  const t = useAppTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const background = {
    primary: t.primary,
    success: t.successSoft,
    danger: t.dangerSoft,
    ghost: t.ghost,
    tonal: t.primarySoft,
  }[variant];
  const textColor = {
    primary: t.onPrimary,
    success: t.success,
    danger: t.danger,
    ghost: t.ghostText,
    tonal: t.dark ? t.text : t.primary,
  }[variant];
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, {
            toValue: 0.95,
            useNativeDriver: USE_NATIVE_DRIVER,
            speed: 50,
            bounciness: 0,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: USE_NATIVE_DRIVER,
            speed: 20,
            bounciness: 6,
          }).start()
        }
        disabled={disabled || loading}
        style={[
          styles.btn,
          { backgroundColor: background },
          (disabled || loading) && { opacity: 0.5 },
        ]}
      >
        {loading ? (
          <SowSpinner size={20} onDark={variant === "primary" ? !t.dark : t.dark} />
        ) : (
          <Text style={[styles.btnText, { color: textColor }]}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
};

/**
 * Small round icon-only button for inline card actions. Optionally tinted
 * (`bg`/`color`), resizable, and able to show a small count badge.
 */
export const IconButton = ({
  name,
  onPress,
  color,
  bg,
  size = 34,
  badge,
  badgeColor,
  badgeTextColor,
  accessibilityLabel,
  disabled,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  bg?: string;
  size?: number;
  /** A count shown as a badge on the top-right corner (hidden when 0). */
  badge?: number;
  /** Background colour of the badge pill — defaults to accent. */
  badgeColor?: string;
  /** Text colour inside the badge pill — defaults to white. */
  badgeTextColor?: string;
  accessibilityLabel?: string;
  disabled?: boolean;
}) => {
  const t = useAppTheme();
  const { scale, onPressIn, onPressOut } = usePressScale();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        hitSlop={8}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[
          styles.iconButton,
          { width: size, height: size, backgroundColor: bg ?? t.ghost },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Ionicons name={name} size={Math.round(size * 0.5)} color={color ?? t.ghostText} />
        {badge != null && badge > 0 ? (
          <View style={[styles.iconBadge, { backgroundColor: badgeColor ?? t.accent }]}>
            <Text style={[styles.iconBadgeText, badgeTextColor ? { color: badgeTextColor } : null]}>
              {badge > 99 ? "99+" : badge}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
};
