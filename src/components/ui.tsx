import { Ionicons } from "@expo/vector-icons";
import { ConvexError } from "convex/values";
import * as Haptics from "expo-haptics";
import { ReactNode, Ref, useEffect, useRef, useState } from "react";
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
import { radius, spacing, typography, useAppTheme } from "../theme";

const haptic = (style = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS === "web") return;
  void Haptics.impactAsync(style);
};
const hapticSelect = () => {
  if (Platform.OS === "web") return;
  void Haptics.selectionAsync();
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
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
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
        {(title || headerRight) && (
          <FadeInView>
            <View style={styles.header}>
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
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(8)).current;
  const [shown, setShown] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    opacity.setValue(0);
    lift.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.spring(lift, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 240 }),
    ]).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => setShown(null));
    }, 2000);
    return () => clearTimeout(timer);
  }, [toast, opacity, lift]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        t.shadowFloat,
        { backgroundColor: t.text, opacity, transform: [{ translateY: lift }] },
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
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <View pointerEvents="box-none" style={styles.footerWrap}>
      <View style={styles.footerRow}>
        {onInfo && (
          <Pressable
            onPress={() => { haptic(); onInfo(); }}
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
            onPress={() => { haptic(); onPress(); }}
            onPressIn={() =>
              Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start()
            }
            onPressOut={() =>
              Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start()
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

export const Row = ({ children }: { children: ReactNode }) => (
  <View style={styles.row}>{children}</View>
);

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
  const scale = useRef(new Animated.Value(1)).current;
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
        onPress={() => {
          haptic(
            variant === "danger"
              ? Haptics.ImpactFeedbackStyle.Medium
              : Haptics.ImpactFeedbackStyle.Light
          );
          onPress();
        }}
        onPressIn={() =>
          Animated.spring(scale, {
            toValue: 0.95,
            useNativeDriver: true,
            speed: 50,
            bounciness: 0,
          }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, {
            toValue: 1,
            useNativeDriver: true,
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
  return (
    <Pressable
      hitSlop={8}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={() => { hapticSelect(); onPress(); }}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, backgroundColor: bg ?? t.ghost },
        disabled && { opacity: 0.5 },
        pressed && { opacity: 0.6 },
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
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) => {
  const t = useAppTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <View style={styles.dialogOuter} pointerEvents="box-none">
          <View style={[styles.dialog, { backgroundColor: t.card }]}>
            <Text style={[typography.headline, styles.optionSheetTitle, { color: t.text }]}>
              {title}
            </Text>
            <ScrollView contentContainerStyle={styles.optionList} keyboardShouldPersistTaps="handled">
              {children}
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
  // Reset the typed text whenever the dialog opens or closes.
  useEffect(() => {
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
    <OptionSheet visible={visible} title={title} onClose={close}>
      <View style={{ paddingHorizontal: 4, paddingBottom: 8, gap: 12 }}>
        {message ? <Muted>{message}</Muted> : null}
        {requireText !== undefined && (
          <Field
            label={`Type "${requireText}" to confirm`}
            value={input}
            onChangeText={setInput}
            placeholder={requireText}
          />
        )}
        <Row>
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
      </View>
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
}: {
  year: number;
  years: number[];
  onSelect: (year: number) => void;
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
            label={String(y)}
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
        onPress={() => { hapticSelect(); onOpen(); }}
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
              hapticSelect();
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
            onPress={() => { hapticSelect(); toggle(option.value); }}
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
  const slide = useRef(new Animated.Value(0)).current;
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
      useNativeDriver: true,
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
            onPress={() => { hapticSelect(); onChange(segment.key); }}
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
        <View style={styles.dialogOuter} pointerEvents="box-none">
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
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: {
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
  card: {
    borderRadius: radius.lg,
    padding: spacing.lg + 2,
    gap: spacing.sm + 2,
  },
  sectionTitle: { marginTop: spacing.md, marginBottom: -2 },
  row: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap", alignItems: "center" },
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
  optionSheetTitle: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  optionList: { paddingHorizontal: spacing.md, paddingBottom: spacing.lg, gap: 2 },
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
  loading: { paddingVertical: spacing.xxxl, alignItems: "center" },
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
    maxHeight: "85%",
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
