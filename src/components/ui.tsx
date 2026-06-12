import { ConvexError } from "convex/values";
import * as Haptics from "expo-haptics";
import { ReactNode, Ref, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "../theme";

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
  return <Text {...props} style={[{ color: t.text }, style]} />;
};

export const Screen = ({
  children,
  toast,
  scrollRef,
  footer,
}: {
  children?: ReactNode;
  toast?: ToastState;
  /** Exposes the screen's ScrollView, e.g. to scroll back to the top. */
  scrollRef?: Ref<ScrollView>;
  /** Pinned full-width area between the scroll content and the tab bar. */
  footer?: ReactNode;
}) => {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.scroll, footer != null && { paddingBottom: 70 }]}
      >
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
  const [shown, setShown] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    setShown(toast);
    opacity.setValue(0);
    Animated.timing(opacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 400,
        useNativeDriver: false,
      }).start(() => setShown(null));
    }, 2000);
    return () => clearTimeout(timer);
  }, [toast, opacity]);
  if (!shown) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { backgroundColor: t.text, opacity }]}
    >
      <Text style={[styles.toastText, { color: t.background }]}>✓ {shown.text}</Text>
    </Animated.View>
  );
};

/** Full-width rectangle button pinned above the tab bar. */
export const FooterAction = ({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={() => { haptic(); onPress(); }}
      disabled={disabled}
      style={({ pressed }) => [
        styles.footerAction,
        { backgroundColor: t.primary },
        (pressed || disabled) && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.footerActionText, { color: t.onPrimary }]}>{title}</Text>
    </Pressable>
  );
};

export const Card = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return <View style={[styles.card, { backgroundColor: t.card }]}>{children}</View>;
};

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Txt style={styles.sectionTitle}>{children}</Txt>
);

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
  variant?: "primary" | "danger" | "ghost" | "success";
  disabled?: boolean;
  /** Shows a spinner in place of the label and disables the button. */
  loading?: boolean;
}) => {
  const t = useAppTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const background = {
    primary: t.primary,
    success: t.success,
    danger: t.danger,
    ghost: t.ghost,
  }[variant];
  const textColor =
    variant === "ghost"
      ? t.ghostText
      : variant === "primary"
        ? t.onPrimary
        : "#ffffff";
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
          <ActivityIndicator size="small" color={textColor} />
        ) : (
          <Text style={[styles.btnText, { color: textColor }]}>{title}</Text>
        )}
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
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: t.inputBackground, color: t.text },
          Platform.OS !== "ios" && { borderWidth: 1, borderColor: t.border },
          multiline && styles.inputMultiline,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.muted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        multiline={multiline}
      />
    </View>
  );
};

export type SelectOption = string | { label: string; value: string };

/** A labelled dropdown: a field-like button opening a modal option list. */
export const Select = ({
  label,
  value,
  options,
  onSelect,
  placeholder,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
}) => {
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const normalized = options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );
  const selectedLabel =
    normalized.find((option) => option.value === value)?.label ?? value;
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <Pressable
        style={[
          styles.input,
          { backgroundColor: t.inputBackground },
          Platform.OS !== "ios" && { borderWidth: 1, borderColor: t.border },
        ]}
        onPress={() => { hapticSelect(); setOpen(true); }}
      >
        <Text style={{ color: value ? t.text : t.muted }}>
          {selectedLabel || placeholder || "Select…"} ▾
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.selectMenu, { backgroundColor: t.card }]}>
            <ScrollView style={{ maxHeight: 360 }}>
              {normalized.map((option) => (
                <Pressable
                  key={option.value || "(empty)"}
                  style={[
                    styles.selectItem,
                    option.value === value && { backgroundColor: t.ghost },
                  ]}
                  onPress={() => {
                    hapticSelect();
                    onSelect(option.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={{
                      color: t.text,
                      fontWeight: option.value === value ? "700" : "400",
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
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
  const t = useAppTheme();
  const [open, setOpen] = useState(false);
  const normalized = options.map((o) =>
    typeof o === "string" ? { label: o, value: o } : o
  );
  const selectedLabels = values
    .map((v) => normalized.find((o) => o.value === v)?.label ?? v)
    .join(", ");
  const toggle = (value: string) => {
    onSelect(
      values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
    );
  };
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <Pressable
        style={[
          styles.input,
          { backgroundColor: t.inputBackground },
          Platform.OS !== "ios" && { borderWidth: 1, borderColor: t.border },
        ]}
        onPress={() => { hapticSelect(); setOpen(true); }}
      >
        <Text style={{ color: values.length > 0 ? t.text : t.muted }}>
          {selectedLabels || placeholder || "Select…"} ▾
        </Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade">
        <Pressable style={styles.selectBackdrop} onPress={() => setOpen(false)}>
          <View style={[styles.selectMenu, { backgroundColor: t.card }]}>
            <ScrollView style={{ maxHeight: 360 }}>
              {normalized.map((option) => {
                const selected = values.includes(option.value);
                return (
                  <Pressable
                    key={option.value || "(empty)"}
                    style={[styles.selectItem, selected && { backgroundColor: t.ghost }]}
                    onPress={() => { hapticSelect(); toggle(option.value); }}
                  >
                    <Text style={{ color: t.text, fontWeight: selected ? "700" : "400" }}>
                      {selected ? "✓  " : "    "}{option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
};

export type Segment = { key: string; label: string; badge?: number };

/** Equal-width pill switcher for sections that share one tab. */
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
  if (segments.length < 2) return null;
  return (
    <View style={[styles.segmented, { backgroundColor: t.ghost }]}>
      {segments.map((segment) => {
        const selected = segment.key === active;
        return (
          <Pressable
            key={segment.key}
            style={[styles.segment, selected && { backgroundColor: t.card }]}
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
              <View style={[styles.segmentBadge, { backgroundColor: t.danger }]}>
                <Text style={styles.segmentBadgeText}>{segment.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

/**
 * A modal form sheet: the backdrop fades in while only the card slides up,
 * matching native iOS bottom sheet behaviour (no full-screen curtain effect).
 */
export const Sheet = ({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) => {
  const t = useAppTheme();
  const [mounted, setMounted] = useState(false);
  const slideY = useRef(new Animated.Value(600)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      slideY.setValue(600);
      fade.setValue(0);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 26, stiffness: 300 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 600, duration: 200, useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible, slideY, fade]);

  if (!mounted) return null;

  // On web the tab bar renders above the Modal in CSS z-order, so we push
  // the sheet card up by the tab bar height (56px) to keep buttons visible.


  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.sheetOuter}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Backdrop: fades in/out independently of the card */}
        <Animated.View style={[StyleSheet.absoluteFill, styles.sheetBackdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        {/* Card: slides up from below */}
        <Animated.View style={{ transform: [{ translateY: slideY }] }}>
          <SafeAreaView
            edges={["bottom"]}
            style={[styles.sheet, { backgroundColor: t.card }]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: t.border }]} />
            <ScrollView
              contentContainerStyle={styles.sheetContent}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export const Chip = ({ label }: { label: string }) => {
  const t = useAppTheme();
  const colors =
    label === "PAID" || label === "DECLINED" ? t.chip[label] : t.chip.default;
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.chipText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
};

export const ErrorBanner = ({ message }: { message: string | null }) => {
  const t = useAppTheme();
  return message ? (
    <View style={[styles.error, { backgroundColor: t.errorBackground }]}>
      <Text style={{ color: t.errorText }}>{message}</Text>
    </View>
  ) : null;
};

export const Muted = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return <Text style={[styles.muted, { color: t.muted }]}>{children}</Text>;
};

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
    <View style={[round, styles.avatarFallback, { backgroundColor: t.ghost }]}>
      <Text style={{ color: t.ghostText, fontWeight: "800", fontSize: size / 3 }}>
        {initials}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: {
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  // Pill buttons, matching the web app's rounded SOW styling.
  btn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
  },
  btnText: { fontWeight: "600" },
  field: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  input: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  inputMultiline: { minHeight: 80, textAlignVertical: "top" },
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chipText: { fontSize: 12, fontWeight: "700" },
  error: {
    borderRadius: 8,
    padding: 10,
  },
  muted: { fontSize: 13 },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  selectBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    padding: 32,
  },
  selectMenu: {
    borderRadius: 12,
    paddingVertical: 4,
    maxWidth: 360,
    width: "100%",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  selectItem: { paddingHorizontal: 16, paddingVertical: 12 },
  segmented: {
    flexDirection: "row",
    borderRadius: 999,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  segmentText: { fontSize: 13, fontWeight: "600" },
  segmentBadge: {
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBadgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  sheetOuter: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetBackdrop: {
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "88%",
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  sheetContent: { padding: 16, paddingBottom: 24, gap: 8 },
  toast: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  toastText: { fontWeight: "700", fontSize: 13 },
  footerAction: {
    height: 54,
    alignItems: "center",
    justifyContent: "center",
  },
  footerActionText: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },
});
