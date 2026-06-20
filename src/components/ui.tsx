import { Ionicons } from "@expo/vector-icons";
import { ConvexError } from "convex/values";
import * as Haptics from "expo-haptics";
import { Children, ReactNode, Ref, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextProps,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { radius, spacing, typography, USE_NATIVE_DRIVER, useAppTheme } from "../theme";

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

/** Keeps digits and a single decimal point — for $ amount inputs. */
export const currencyText = (text: string): string => {
  const [whole, ...decimals] = text.replace(/[^0-9.]/g, "").split(".");
  return decimals.length === 0 ? whole : `${whole}.${decimals.join("")}`;
};

/** Text that follows the system theme. Use instead of the raw <Text>. */
export const Txt = ({ style, ...props }: TextProps) => {
  const t = useAppTheme();
  return <Text {...props} style={[typography.body, { color: t.text }, style]} />;
};

/**
 * Gentle mount animation: fade in while drifting up. Wrap list items and
 * pass a small staggered `delay` for a premium cascade.
 */
export const FadeInView = ({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(12));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [opacity, translateY, delay]);
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

/** Stagger helper: caps the cascade so long lists don't feel sluggish. */
export const stagger = (index: number): number => Math.min(index, 8) * 50;

export const Screen = ({
  children,
  toast,
  scrollRef,
  footer,
  title,
  subtitle,
  headerRight,
  onBack,
  onEndReached,
}: {
  children?: ReactNode;
  toast?: ToastState;
  /** Exposes the screen's ScrollView, e.g. to scroll back to the top. */
  scrollRef?: Ref<ScrollView>;
  /** Pinned full-width area between the scroll content and the tab bar. */
  footer?: ReactNode;
  /** Large display title rendered at the top of the scroll content. */
  title?: string;
  /** Quiet line above the title — greeting, date, context. */
  subtitle?: string;
  /** Rendered to the right of the title (e.g. an avatar or a year picker). */
  headerRight?: ReactNode;
  /** When set, shows a back chevron to the left of the title. */
  onBack?: () => void;
  /** Fired while the user scrolls within ~600px of the bottom (infinite load). */
  onEndReached?: () => void;
}) => {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: t.background }}
        contentContainerStyle={[styles.scroll, footer != null && { paddingBottom: 96 }]}
        scrollEventThrottle={onEndReached ? 16 : undefined}
        onScroll={
          onEndReached
            ? ({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                const distanceFromBottom =
                  contentSize.height - (contentOffset.y + layoutMeasurement.height);
                if (distanceFromBottom < 600) onEndReached();
              }
            : undefined
        }
      >
        {(title || headerRight || onBack) && (
          <FadeInView>
            <View style={styles.header}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="chevron-back" size={26} color={t.text} />
                </Pressable>
              ) : null}
              <View style={styles.headerText}>
                {subtitle ? (
                  <Text style={[typography.caption, { color: t.muted, marginBottom: 2 }]}>
                    {subtitle}
                  </Text>
                ) : null}
                {title ? (
                  <Text style={[typography.largeTitle, { color: t.text }]}>{title}</Text>
                ) : null}
              </View>
              {headerRight}
            </View>
          </FadeInView>
        )}
        {children}
      </ScrollView>
      {footer}
      <Toast toast={toast ?? null} />
    </SafeAreaView>
  );
};

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

/** Floating full-width pill action pinned above the tab bar. */
export const FooterAction = ({
  title,
  onPress,
  disabled,
  onInfo,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  /** Optional info icon button rendered to the left of the main pill. */
  onInfo?: () => void;
}) => {
  const t = useAppTheme();
  const [scale] = useState(() => new Animated.Value(1));
  return (
    <View style={[styles.footerWrap, { pointerEvents: "box-none" }]}>
      <View style={styles.footerRow}>
        {onInfo && (
          <Pressable
            onPress={onInfo}
            style={[styles.footerInfoBtn, { backgroundColor: t.card }, t.shadowFloat]}
          >
            <Ionicons name="information-circle-outline" size={22} color={t.primary} />
          </Pressable>
        )}
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
              disabled && { opacity: 0.6 },
            ]}
          >
            <Text style={[styles.footerActionText, { color: t.onPrimary }]}>{title}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
};

export const Card = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const t = useAppTheme();
  return (
    <View style={[styles.card, t.shadowCard, { backgroundColor: t.card }, style]}>
      {children}
    </View>
  );
};

/** Quiet uppercase section label, Linear-style. */
export const SectionTitle = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return (
    <Text style={[typography.label, styles.sectionTitle, { color: t.muted }]}>
      {children}
    </Text>
  );
};

export const Row = ({
  children,
  spread,
  loading,
}: {
  children: ReactNode;
  /** Gives each child an equal share of the width — e.g. Cancel | Save at 50/50. */
  spread?: boolean;
  /** Replaces the row's children with a centred SOW spinner at button height. */
  loading?: boolean;
}) => {
  if (loading) {
    return (
      <View style={styles.rowLoading}>
        <SowSpinner size={24} />
      </View>
    );
  }
  if (spread) {
    return (
      <View style={styles.rowSpread}>
        {Children.map(children, (child) => (
          <View style={{ flex: 1 }}>{child}</View>
        ))}
      </View>
    );
  }
  return <View style={styles.row}>{children}</View>;
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

export const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address";
  multiline?: boolean;
}) => {
  const t = useAppTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: t.inputBackground,
            color: t.text,
            borderColor: focused ? t.primary : "transparent",
          },
          multiline && styles.inputMultiline,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        keyboardType={keyboardType}
        autoCapitalize="none"
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
};

export type SelectOption = string | { label: string; value: string };

const normalizeOptions = (options: readonly SelectOption[]) =>
  options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );

/** Centered dialog option list shared by Select and MultiSelect. */
export const OptionSheet = ({
  visible,
  title,
  onClose,
  children,
  contentStyle,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Overrides the default option-list padding — use for non-list content. */
  contentStyle?: StyleProp<ViewStyle>;
}) => {
  const t = useAppTheme();
  // Retain the last content shown while the modal fades out, so resetting the
  // backing state on close (e.g. setX(null)) doesn't blank the dialog mid-fade.
  // Reading/writing these refs during render is deliberate and synchronous (to
  // avoid a one-frame flash on open), hence the scoped disable.
  /* eslint-disable react-hooks/refs -- intentional retain-through-fade pattern */
  const shownTitle = useRef(title);
  const shownChildren = useRef(children);
  if (visible) {
    shownTitle.current = title;
    shownChildren.current = children;
  }
  const retainedTitle = shownTitle.current;
  const retainedChildren = shownChildren.current;
  /* eslint-enable react-hooks/refs */
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <View style={[styles.dialogOuter, { pointerEvents: "box-none" }]}>
          <View style={[styles.dialog, { backgroundColor: t.card }]}>
            <View style={styles.optionSheetHeader}>
              <Text
                style={[typography.headline, { color: t.text, flex: 1 }]}
                numberOfLines={1}
              >
                {retainedTitle}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={({ pressed }) => [
                  styles.optionSheetClose,
                  { backgroundColor: t.ghost },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="close" size={20} color={t.ghostText} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={contentStyle ?? styles.optionList} keyboardShouldPersistTaps="handled">
              {retainedChildren}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
};

/**
 * A reusable confirmation dialog modelled on the Structure tab's type-to-confirm
 * sheet. Use it everywhere instead of the platform's native confirm dialogs.
 *
 * Pass `requireText` for high-stakes deletes (e.g. a person): the confirm button
 * stays disabled until the typed text matches it exactly (trimmed). Omit it for a
 * plain Cancel/Confirm dialog. `destructive` (default true) tints the confirm
 * button red; set it false for non-destructive confirmations.
 */
export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  destructive = true,
  requireText,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** When set, require the user to type this exact text before confirming. */
  requireText?: string;
  onConfirm: () => void;
  onClose: () => void;
}) => {
  const [input, setInput] = useState("");
  // Reset the typed text whenever the dialog closes (covers callers that flip
  // `visible` off without going through the dialog's own close handler).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on close
    if (!visible) setInput("");
  }, [visible]);
  // Normalise both sides: data-sourced requireText may carry stray whitespace.
  const normalizedRequired = requireText?.trim();
  const confirmDisabled =
    normalizedRequired !== undefined && input.trim() !== normalizedRequired;
  const close = () => {
    setInput("");
    onClose();
  };
  return (
    <OptionSheet visible={visible} title={title} onClose={close} contentStyle={styles.confirmContent}>
      {message ? <Muted>{message}</Muted> : null}
      {requireText !== undefined && (
        <Field
          label={`Type "${requireText}" to confirm`}
          value={input}
          onChangeText={setInput}
          placeholder={requireText}
        />
      )}
      <Row spread>
        <Btn title={cancelLabel} variant="ghost" onPress={close} />
        <Btn
          title={confirmLabel}
          variant={destructive ? "danger" : "primary"}
          disabled={confirmDisabled}
          onPress={() => {
            onConfirm();
            close();
          }}
        />
      </Row>
    </OptionSheet>
  );
};

export const OptionRow = ({
  label,
  selected,
  onPress,
  multi,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.optionRow,
        selected && { backgroundColor: t.primarySoft },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onPress}
    >
      <Text
        numberOfLines={1}
        style={[
          typography.body,
          { color: t.text, flex: 1 },
          selected && { fontWeight: "700" },
        ]}
      >
        {label}
      </Text>
      <Ionicons
        name={
          selected
            ? multi
              ? "checkbox"
              : "checkmark-circle"
            : multi
              ? "square-outline"
              : "ellipse-outline"
        }
        size={20}
        color={selected ? t.primary : t.faint}
      />
    </Pressable>
  );
};

/** Compact pill that opens a staff-year picker as a bottom sheet. */
export const YearPill = ({
  year,
  years,
  onSelect,
  formatLabel,
}: {
  year: number;
  years: number[];
  onSelect: (year: number) => void;
  /** Optional label formatter for the dropdown rows (e.g. "2026 (current)"). */
  formatLabel?: (year: number) => string;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.yearPill,
          t.shadowCard,
          { backgroundColor: t.card },
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => setOpen(true)}
      >
        <Txt style={styles.yearPillText}>{year}</Txt>
        <Ionicons name="chevron-down" size={14} color={t.muted} />
      </Pressable>
      <OptionSheet visible={open} title="Year" onClose={() => setOpen(false)}>
        {years.map((y) => (
          <OptionRow
            key={y}
            label={formatLabel ? formatLabel(y) : String(y)}
            selected={y === year}
            onPress={() => {
              onSelect(y);
              setOpen(false);
            }}
          />
        ))}
      </OptionSheet>
    </>
  );
};

/** The tappable field face shared by Select and MultiSelect. */
const SelectFace = ({
  label,
  display,
  hasValue,
  onOpen,
  disabled,
}: {
  label: string;
  display: string;
  hasValue: boolean;
  onOpen: () => void;
  disabled?: boolean;
}) => {
  const t = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <Pressable
        disabled={disabled}
        style={({ pressed }) => [
          styles.input,
          styles.selectFace,
          { backgroundColor: t.inputBackground, borderColor: "transparent" },
          disabled && { opacity: 0.6 },
          !disabled && pressed && { opacity: 0.7 },
        ]}
        onPress={onOpen}
      >
        <Text
          numberOfLines={1}
          style={[typography.body, { color: hasValue ? t.text : t.faint, flex: 1 }]}
        >
          {display}
        </Text>
        <Ionicons
          name={disabled ? "lock-closed-outline" : "chevron-down"}
          size={16}
          color={t.faint}
        />
      </Pressable>
    </View>
  );
};

/** A labelled dropdown: a field-like button opening a bottom option sheet. */
export const Select = ({
  label,
  value,
  options,
  onSelect,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  /** Renders the field as a read-only, locked dropdown that can't be opened. */
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const normalized = normalizeOptions(options);
  const selectedLabel =
    normalized.find((option) => option.value === value)?.label ?? value;
  return (
    <>
      <SelectFace
        label={label}
        display={selectedLabel || placeholder || "Select…"}
        hasValue={!!value}
        disabled={disabled}
        onOpen={() => setOpen(true)}
      />
      <OptionSheet visible={open} title={label} onClose={() => setOpen(false)}>
        {normalized.map((option) => (
          <OptionRow
            key={option.value || "(empty)"}
            label={option.label}
            selected={option.value === value}
            onPress={() => {
              onSelect(option.value);
              setOpen(false);
            }}
          />
        ))}
      </OptionSheet>
    </>
  );
};

/** A labelled dropdown that allows selecting multiple values. */
export const MultiSelect = ({
  label,
  values,
  options,
  onSelect,
  placeholder,
}: {
  label: string;
  values: string[];
  options: readonly SelectOption[];
  onSelect: (values: string[]) => void;
  placeholder?: string;
}) => {
  const [open, setOpen] = useState(false);
  const normalized = normalizeOptions(options);
  const selectedLabels = values
    .map((v) => normalized.find((o) => o.value === v)?.label ?? v)
    .join(", ");
  const toggle = (value: string) => {
    onSelect(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
    );
  };
  return (
    <>
      <SelectFace
        label={label}
        display={selectedLabels || placeholder || "Select…"}
        hasValue={values.length > 0}
        onOpen={() => setOpen(true)}
      />
      <OptionSheet visible={open} title={label} onClose={() => setOpen(false)}>
        {normalized.map((option) => (
          <OptionRow
            key={option.value || "(empty)"}
            label={option.label}
            selected={values.includes(option.value)}
            multi
            onPress={() => toggle(option.value)}
          />
        ))}
      </OptionSheet>
    </>
  );
};

export type Segment = {
  key: string;
  label: string;
  /** Action count — rendered in yellow/warning colour. */
  badge?: number;
  /** Unread message count — rendered in white. */
  messageBadge?: number;
};

/** Equal-width pill switcher with a sliding indicator. */
export const Segmented = ({
  segments,
  active,
  onChange,
}: {
  segments: Segment[];
  active: string;
  onChange: (key: string) => void;
}) => {
  const t = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(0);
  const [slide] = useState(() => new Animated.Value(0));
  const activeIndex = Math.max(
    segments.findIndex((segment) => segment.key === active),
    0
  );
  const segmentWidth =
    segments.length > 0 ? (trackWidth - 2 * styles.segmented.padding) / segments.length : 0;
  useEffect(() => {
    if (trackWidth === 0) return;
    Animated.timing(slide, {
      toValue: activeIndex * segmentWidth,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();
  }, [activeIndex, segmentWidth, trackWidth, slide]);
  if (segments.length < 2) return null;
  return (
    <View
      style={[styles.segmented, { backgroundColor: t.ghost }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {trackWidth > 0 && (
        <Animated.View
          style={[
            styles.segmentIndicator,
            {
              backgroundColor: t.card,
              width: segmentWidth,
              transform: [{ translateX: slide }],
            },
          ]}
        />
      )}
      {segments.map((segment) => {
        const selected = segment.key === active;
        return (
          <Pressable
            key={segment.key}
            style={styles.segment}
            onPress={() => onChange(segment.key)}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                { color: selected ? t.text : t.muted },
                selected && { fontWeight: "700" },
              ]}
            >
              {segment.label}
            </Text>
            {segment.badge ? (
              <View style={[styles.segmentBadge, { backgroundColor: t.warning }]}>
                <Text style={styles.segmentBadgeText}>{segment.badge}</Text>
              </View>
            ) : null}
            {segment.messageBadge ? (
              <View
                style={[
                  styles.segmentBadge,
                  { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cccccc" },
                ]}
              >
                <Text style={[styles.segmentBadgeText, { color: "#333333" }]}>
                  {segment.messageBadge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

/** A centered modal dialog with a dimmed backdrop. */
export const Sheet = ({
  visible,
  onClose,
  children,
  scrollable = true,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
  /** Headline rendered above the content, with a close affordance. */
  title?: string;
}) => {
  const t = useAppTheme();

  const header = title ? (
    <View style={styles.sheetHeader}>
      <Text style={[typography.title, { color: t.text, flex: 1 }]}>{title}</Text>
      <Pressable
        hitSlop={8}
        onPress={onClose}
        style={({ pressed }) => [
          styles.sheetClose,
          { backgroundColor: t.ghost },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Ionicons name="close" size={18} color={t.ghostText} />
      </Pressable>
    </View>
  ) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <View style={[styles.dialogOuter, { pointerEvents: "box-none" }]}>
          <View style={[styles.dialog, { backgroundColor: t.card }]}>
            {scrollable ? (
              <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
                {header}
                {children}
              </ScrollView>
            ) : (
              <View style={styles.sheetContent}>
                {header}
                {children}
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const Chip = ({ label }: { label: string }) => {
  const t = useAppTheme();
  const colors =
    label === "PAID" || label === "DECLINED" ? t.chip[label] : t.chip.default;
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <View style={[styles.chipDot, { backgroundColor: colors.fg }]} />
      <Text style={[styles.chipText, { color: colors.fg }]}>{label}</Text>
    </View>
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

export const Muted = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return <Text style={[typography.caption, { color: t.muted }]}>{children}</Text>;
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

/** SOW logo that rotates continuously — used as the app's loading spinner. */
export const SowSpinner = ({ size = 64, onDark }: { size?: number; onDark?: boolean }) => {
  const t = useAppTheme();
  const dark = onDark ?? t.dark;
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: USE_NATIVE_DRIVER,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
  return (
    <Animated.Image
      source={
        dark
          ? require("../../assets/images/splash-icon-dark.png")
          : require("../../assets/images/splash-icon.png")
      }
      style={{ width: size, height: size, transform: [{ rotate }] }}
      resizeMode="contain"
      accessibilityLabel="Loading"
    />
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

/**
 * Top chrome for the main screens: the SOW logo (taps → Requests) on the left
 * and the profile avatar (taps → Profile) on the right. Replaces the per-screen
 * page titles. The logo art is a black wordmark, tinted to the theme text colour
 * so it reads on both the cream and deep-green backgrounds.
 */
export const TopBar = ({
  photo,
  name,
}: {
  photo: string | null;
  name: string | null;
}) => {
  const t = useAppTheme();
  const router = useRouter();
  const home = usePressScale();
  const profile = usePressScale();
  return (
    <View style={styles.topBar}>
      <Animated.View style={{ transform: [{ scale: home.scale }] }}>
        <Pressable
          onPress={() => router.push("/")}
          onPressIn={home.onPressIn}
          onPressOut={home.onPressOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go to Requests"
        >
          <Image
            source={require("../../assets/images/the-shed-compact-logo.png")}
            style={[styles.topBarLogo, { tintColor: t.text }]}
            resizeMode="contain"
          />
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: profile.scale }] }}>
        <Pressable
          onPress={() => router.push("/profile")}
          onPressIn={profile.onPressIn}
          onPressOut={profile.onPressOut}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
        >
          <Avatar photo={photo} name={name} size={40} />
        </Pressable>
      </Animated.View>
    </View>
  );
};

/**
 * Full-width, square, top-pinned tab switcher: equal-width tabs with an
 * underline under the active one (no rounded pill). Carries the same action /
 * unread badges as {@link Segmented}. Hidden when there are fewer than 2 tabs.
 */
export const TabBar = ({
  segments,
  active,
  onChange,
  position,
}: {
  segments: Segment[];
  active: string;
  onChange: (key: string) => void;
  /**
   * Fractional page position (0 = first tab, 1 = second, …). When supplied —
   * e.g. driven by the pager's scroll on native — the selected-tab underline
   * tracks it continuously. Without it, the underline springs to the active
   * tab on change (the tab-to-tab animation used on web).
   */
  position?: Animated.Value;
}) => {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const activeIndex = Math.max(
    segments.findIndex((segment) => segment.key === active),
    0
  );
  // Fallback driver when no external position is passed (web / tab taps).
  const [internal] = useState(() => new Animated.Value(activeIndex));
  const pos = position ?? internal;
  useEffect(() => {
    if (position) return; // externally driven — don't fight it
    Animated.spring(internal, {
      toValue: activeIndex,
      useNativeDriver: true,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [activeIndex, position, internal]);

  if (segments.length < 2) return null;
  const segWidth = width / segments.length;
  // position 0→1 moves the underline exactly one segment over; linear
  // extrapolation covers any number of segments.
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segWidth],
  });
  return (
    <View
      style={[styles.tabBar, { borderBottomColor: t.separator }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segments.map((segment) => {
        const selected = segment.key === active;
        return (
          <Pressable
            key={segment.key}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.key)}
          >
            <View style={styles.tabLabelRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  { color: selected ? t.text : t.muted },
                  selected && { fontWeight: "700" },
                ]}
              >
                {segment.label}
              </Text>
              {segment.badge ? (
                <View style={[styles.tabBadge, { backgroundColor: t.warning }]}>
                  <Text style={styles.tabBadgeText}>{segment.badge}</Text>
                </View>
              ) : null}
              {segment.messageBadge ? (
                <View
                  style={[
                    styles.tabBadge,
                    { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cccccc" },
                  ]}
                >
                  <Text style={[styles.tabBadgeText, { color: "#333333" }]}>
                    {segment.messageBadge}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Transparent spacer: reserves the underline's height so the bar
                doesn't change size when the real (absolute) indicator slides. */}
            <View style={styles.tabIndicator} />
          </Pressable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabIndicatorBar,
            { width: segWidth, backgroundColor: t.primary, transform: [{ translateX }] },
          ]}
        />
      ) : null}
    </View>
  );
};

/**
 * A soft, blurred placeholder bar shown in place of async content (a person's
 * name, a receipt file link) while it loads. The blur + gentle pulse reads as
 * "loading" without a hard skeleton, and resolves to the real value once the
 * query lands.
 */
export const LoadingBar = ({
  width = 56,
  height = 10,
}: {
  width?: number;
  height?: number;
}) => {
  const t = useAppTheme();
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: t.separator,
        opacity: pulse,
        // Native wants the object form; web (react-native-web) wants a CSS
        // string. Either way it frosts the placeholder while loading.
        filter: Platform.OS === "web" ? "blur(2px)" : [{ blur: 2 }],
      }}
    />
  );
};

/**
 * The year picker, fixed bottom-right above the bottom tab bar. Used on screens
 * where the staff year matters (Org, Manage, Requests "All"). Positioned like
 * {@link FooterAction} — the tab navigator already lays content above the bar,
 * so a small bottom offset clears it.
 */
export const FloatingYearPicker = ({
  year,
  years,
  onSelect,
  formatLabel,
}: {
  year: number;
  years: number[];
  onSelect: (year: number) => void;
  formatLabel?: (year: number) => string;
}) => {
  return (
    <View pointerEvents="box-none" style={styles.floatingYearPicker}>
      <YearPill year={year} years={years} onSelect={onSelect} formatLabel={formatLabel} />
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  topBarLogo: { width: 88, height: 30 },
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingTop: spacing.sm + 2,
    gap: spacing.sm,
  },
  tabLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 4,
  },
  tabText: { fontSize: 13.5, letterSpacing: -0.1 },
  tabIndicator: { height: 2.5, alignSelf: "stretch" },
  tabIndicatorBar: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2.5,
    borderRadius: 2,
  },
  tabBadge: {
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  tabBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  floatingYearPicker: { position: "absolute", right: spacing.lg, bottom: spacing.md },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    paddingBottom: 48,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerText: { flex: 1 },
  headerBack: { marginLeft: -6, justifyContent: "center" },
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg + 2,
    gap: spacing.sm + 2,
  },
  sectionTitle: { marginTop: spacing.md, marginBottom: -2 },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", alignItems: "center" },
  rowSpread: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  rowLoading: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  yearPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  yearPillText: { fontWeight: "700", fontSize: 15 },
  // Pill buttons, matching the web app's rounded SOW styling.
  btn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 11,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 42,
  },
  btnText: { fontWeight: "700", fontSize: 14, letterSpacing: -0.1 },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
  field: { gap: 6 },
  input: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    minHeight: 46,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: "top" },
  selectFace: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  optionSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingLeft: spacing.xl,
    paddingRight: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  optionSheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  optionList: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: 2 },
  // Single uniform padding layer for dialog content (no compounding) — sides and
  // bottom match the title's horizontal inset; top adds to the title's gap.
  confirmContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: 14,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 11.5, fontWeight: "700", letterSpacing: 0.2 },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  emptyMessage: { textAlign: "center", lineHeight: 18 },
  // Fills the available space and centres the spinner so page-level loaders sit
  // in the middle of the screen. The minHeight keeps it visible if a parent
  // doesn't give it room to grow.
  loading: {
    flex: 1,
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  segmented: {
    flexDirection: "row",
    borderRadius: radius.full,
    padding: 4,
  },
  segmentIndicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: radius.full,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.full,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  segmentText: { fontSize: 13, fontWeight: "600", letterSpacing: -0.1 },
  segmentBadge: {
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  dialogOuter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  dialog: {
    borderRadius: radius.xl,
    width: "100%",
    maxWidth: 480,
    // Cap well below full height so there's always a clear backdrop area to
    // tap out, and the dialog never feels like it covers the whole screen.
    maxHeight: "70%",
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetContent: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.sm + 2 },
  toast: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  toastText: { fontWeight: "700", fontSize: 13 },
  footerWrap: {
    position: "absolute",
    bottom: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  footerInfoBtn: {
    width: 54,
    height: 54,
    borderRadius: radius.lg - 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  footerAction: {
    height: 54,
    borderRadius: radius.lg - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  footerActionText: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2 },
});
