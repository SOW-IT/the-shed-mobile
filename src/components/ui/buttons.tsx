import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Animated, Easing, Keyboard, Platform, Pressable, Text, View } from "react-native";
import { USE_NATIVE_DRIVER, radius, spacing, typography, useAppTheme } from "@/theme";
import { usePressScale } from "./format";
import { useAnyModalOpen } from "./modalPresence";
import { SowSpinner } from "./primitives";
import { styles } from "./styles";

const KEYBOARD_EASING = Easing.bezier(0.38, 0.7, 0.125, 1);

const KEYBOARD_LIFT_DURATION_SCALE = 0.6;

const liftDuration = (keyboardDuration: number | undefined) =>
  Math.round((keyboardDuration ?? 250) * KEYBOARD_LIFT_DURATION_SCALE);

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
  onInfo?: () => void;
  note?: string | null;
  cancel?: { onPress: () => void; disabled?: boolean; title?: string };
  bottomOffset?: number;
  avoidKeyboard?: boolean;
}) => {
  const t = useAppTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [lift] = useState(() => new Animated.Value(0));
  const modalOpen = useAnyModalOpen();
  const shouldAvoid = avoidKeyboard && !modalOpen;
  useEffect(() => {
    const keyboardLift = (height: number) => Math.max(0, height - bottomOffset);
    if (!shouldAvoid) {
      lift.setValue(0);
      return;
    }
    if (Platform.OS !== "ios") return;
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
  }, [shouldAvoid, bottomOffset, lift]);
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
            accessibilityRole="button"
            accessibilityLabel="How it works"
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
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost" | "success" | "tonal";
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
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
        ) : icon ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <Ionicons name={icon} size={17} color={textColor} />
            <Text style={[styles.btnText, { color: textColor }]}>{title}</Text>
          </View>
        ) : (
          <Text style={[styles.btnText, { color: textColor }]}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
};

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
  badge?: number;
  badgeColor?: string;
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
