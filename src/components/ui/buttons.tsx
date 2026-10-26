import Ionicons from "@expo/vector-icons/Ionicons";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Animated, Easing, Keyboard, Platform, Pressable, Text, View, type ViewInstance } from "react-native";
import { USE_NATIVE_DRIVER, radius, spacing, typography, useAppTheme } from "@/theme";
import { usePressScale } from "./format";
import { useAnyModalOpen } from "./modalPresence";
import { FOOTER_GAP, footerReach } from "@/lib/footerClearance";
import { SowSpinner } from "./primitives";
import { styles } from "./styles";

export const FooterHeightContext = createContext<(height: number) => void>(() => {});

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
  const wrapRef = useRef<ViewInstance>(null);
  const syncRef = useRef<() => void>(() => {});
  const reportFooterHeight = useContext(FooterHeightContext);
  useEffect(() => () => reportFooterHeight(0), [reportFooterHeight]);
  const [layoutHeight, setLayoutHeight] = useState<number | null>(null);
  useEffect(() => {
    if (layoutHeight != null) {
      reportFooterHeight(footerReach(layoutHeight, bottomOffset));
    }
  }, [layoutHeight, bottomOffset, reportFooterHeight]);
  useEffect(() => {
    if (!shouldAvoid) {
      lift.setValue(0);
      syncRef.current = () => {};
      return;
    }
    if (Platform.OS !== "ios") return;
    let generation = 0;
    const liftFor = (
      keyboard: { screenY: number; height: number },
      apply: (toValue: number) => void
    ) => {
      const node = wrapRef.current;
      if (!node) {
        apply(Math.max(0, keyboard.height - bottomOffset));
        return;
      }
      const measured = generation;
      node.measureInWindow((_x, y, _w, h) => {
        if (measured !== generation) return;
        const restingBottom = y + h;
        const wanted = restingBottom + spacing.md - keyboard.screenY;
        apply(Math.min(keyboard.height, Math.max(0, wanted)));
      });
    };
    syncRef.current = () => {
      const metrics = Keyboard.isVisible() ? Keyboard.metrics() : undefined;
      if (metrics) liftFor(metrics, (v) => lift.setValue(v));
    };
    syncRef.current();
    const show = Keyboard.addListener("keyboardWillShow", (e) => {
      liftFor(e.endCoordinates, (toValue) =>
        Animated.timing(lift, {
          toValue,
          duration: liftDuration(e.duration),
          easing: KEYBOARD_EASING,
          useNativeDriver: true,
        }).start()
      );
    });
    const hide = Keyboard.addListener("keyboardWillHide", (e) => {
      generation += 1;
      Animated.timing(lift, {
        toValue: 0,
        duration: liftDuration(e?.duration),
        easing: KEYBOARD_EASING,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      generation += 1;
      syncRef.current = () => {};
      show.remove();
      hide.remove();
    };
  }, [shouldAvoid, bottomOffset, lift]);
  return (
    <View
      ref={wrapRef}
      pointerEvents="box-none"
      onLayout={(e) => {
        syncRef.current();
        setLayoutHeight(e.nativeEvent.layout.height);
      }}
      style={[
        styles.footerWrap,
        bottomOffset ? { bottom: FOOTER_GAP + bottomOffset } : null,
      ]}
    >
      <Animated.View
        pointerEvents="box-none"
        style={{ transform: [{ translateY: Animated.multiply(lift, -1) }] }}
      >
        {note ? (
          <View
            style={[
              styles.footerNote,
              { backgroundColor: t.card, borderColor: t.warning },
              t.shadowFloat,
            ]}
          >
            <Ionicons name="warning-outline" size={16} color={t.warning} />
            <Text
              style={[
                typography.caption,
                styles.footerNoteText,
                { color: t.warning },
              ]}
            >
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
                accessibilityRole="button"
                accessibilityState={{ disabled: Boolean(cancel.disabled) }}
                style={({ pressed }) => [
                  styles.footerAction,
                  {
                    backgroundColor: t.card,
                    borderWidth: 1.5,
                    borderColor: cancel.disabled ? t.separator : t.border,
                  },
                  pressed && !cancel.disabled && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.footerActionText, { color: cancel.disabled ? t.faint : t.text }]}>
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
              accessibilityRole="button"
              accessibilityState={{ disabled: Boolean(disabled) }}
              style={[
                styles.footerAction,
                { backgroundColor: disabled ? t.ghost : t.primary },
              ]}
            >
              <Text style={[styles.footerActionText, { color: disabled ? t.faint : t.onPrimary }]}>{title}</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
};

export type FooterIconAction = {
  icon: keyof typeof Ionicons.glyphMap;
  accessibilityLabel: string;
  onPress: () => void;
  badge?: number;
  primary?: boolean;
};

const FOOTER_ICON_SIZE = 52;

const FooterIconButton = ({ icon, accessibilityLabel, onPress, badge, primary }: FooterIconAction) => {
  const t = useAppTheme();
  const { scale, onPressIn, onPressOut } = usePressScale(0.94);
  const iconColour = primary ? t.onPrimary : t.dark ? t.text : t.primary;
  return (
    <Animated.View style={[{ borderRadius: radius.full, transform: [{ scale }] }, t.shadowFloat]}>
      <Pressable
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.iconButton,
          {
            width: FOOTER_ICON_SIZE,
            height: FOOTER_ICON_SIZE,
            backgroundColor: primary ? t.primary : t.card,
          },
          !primary && { borderWidth: 1.5, borderColor: t.border },
        ]}
      >
        <Ionicons name={icon} size={primary ? 28 : 23} color={iconColour} />
        {badge != null && badge > 0 ? (
          <View style={[styles.footerIconBadge, { backgroundColor: t.primary, borderColor: t.card }]}>
            <Text style={[styles.iconBadgeText, { color: t.onPrimary }]}>{badge > 99 ? "99+" : badge}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
};

export const FooterIconActions = ({ actions }: { actions: FooterIconAction[] }) => {
  const reportFooterHeight = useContext(FooterHeightContext);
  useEffect(() => () => reportFooterHeight(0), [reportFooterHeight]);
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => reportFooterHeight(footerReach(e.nativeEvent.layout.height))}
      style={styles.footerWrap}
    >
      <View pointerEvents="box-none" style={[styles.footerRow, { justifyContent: "flex-end" }]}>
        {actions.map((action) => (
          <FooterIconButton key={action.icon} {...action} />
        ))}
      </View>
    </View>
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
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
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
  label,
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  bg?: string;
  size?: number;
  label?: string;
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
          label ? { width: "auto", minWidth: size, flexDirection: "row", gap: 6, paddingHorizontal: 14 } : null,
          disabled && { opacity: 0.5 },
        ]}
      >
        <Ionicons name={name} size={Math.round(size * 0.5)} color={color ?? t.ghostText} />
        {label ? (
          <Text style={[typography.caption, { color: color ?? t.ghostText, fontWeight: "700" }]}>{label}</Text>
        ) : null}
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
