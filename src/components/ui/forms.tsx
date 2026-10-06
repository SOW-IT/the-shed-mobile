import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from "react-native";
import { USE_NATIVE_DRIVER, spacing, typography, useAppTheme } from "@/theme";
import { useRegisterModal } from "./modalPresence";
import { FastModal, SowSpinner, Txt } from "./primitives";
import { useRevealFocusedInput } from "./revealFocus";
import { styles } from "./styles";

export const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize = "none",
  multiline,
  disabled,
  maxLength,
  testID,
  accessibilityLabel,
}: {
  /** Shown above the box; leave out when a question heading already names it. */
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "decimal-pad" | "email-address";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  disabled?: boolean;
  maxLength?: number;
  /** Stable handle for end-to-end tests. */
  testID?: string;
  accessibilityLabel?: string;
}) => {
  const t = useAppTheme();
  const [focused, setFocused] = useState(false);
  const reveal = useRevealFocusedInput();
  return (
    <View style={styles.field}>
      {label ? (
        <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: t.inputBackground,
            borderColor: focused && !disabled ? t.primary : "transparent",
          },
          disabled && { opacity: 0.6 },
        ]}
      >
        <TextInput
          style={[
            styles.inputInner,
            { color: t.text },
            multiline && styles.inputMultiline,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.faint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          testID={testID}
          accessibilityLabel={accessibilityLabel ?? label}
          multiline={multiline}
          editable={!disabled}
          onFocus={() => {
            setFocused(true);
            reveal();
          }}
          onBlur={() => setFocused(false)}
        />
        {disabled ? (
          <Ionicons name="lock-closed-outline" size={16} color={t.faint} />
        ) : null}
      </View>
    </View>
  );
};

/**
 * The search box above a list. Shows the spinner while results for the typed
 * text are on their way, and a clear button once there's text.
 */
export const SearchField = ({
  value,
  onChangeText,
  placeholder,
  loading,
  autoFocus,
  clearLabel = "Clear search",
  style,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  loading?: boolean;
  autoFocus?: boolean;
  clearLabel?: string;
  style?: StyleProp<ViewStyle>;
}) => {
  const t = useAppTheme();
  const reveal = useRevealFocusedInput();
  return (
    <View style={[styles.search, { backgroundColor: t.inputBackground }, style]}>
      <Ionicons name="search-outline" size={18} color={t.faint} />
      <TextInput
        style={[styles.searchInput, { color: t.text }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        onFocus={reveal}
      />
      {loading ? <SowSpinner size={20} /> : null}
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          hitSlop={8}
          onPress={() => onChangeText("")}
          style={({ pressed }) => [
            styles.searchClear,
            { backgroundColor: t.ghost },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Ionicons name="close" size={16} color={t.ghostText} />
        </Pressable>
      ) : null}
    </View>
  );
};

export type SelectOption = string | { label: string; value: string };

const normalizeOptions = (options: readonly SelectOption[]) =>
  options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );

export const OptionSheet = ({
  visible,
  title,
  onClose,
  children,
  contentStyle,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
}) => {
  const t = useAppTheme();
  useRegisterModal(visible);
  /* eslint-disable react-hooks/refs -- intentional retain-through-fade pattern */
  const shownTitle = useRef(title);
  const shownChildren = useRef(children);
  const shownFooter = useRef(footer);
  if (visible) {
    shownTitle.current = title;
    shownChildren.current = children;
    shownFooter.current = footer;
  }
  const retainedTitle = shownTitle.current;
  const retainedChildren = shownChildren.current;
  const retainedFooter = shownFooter.current;
  const hasFooter = retainedFooter != null;
  const bodyStyle = [contentStyle ?? styles.optionList];
  return (
    <FastModal visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={spacing.md}
          pointerEvents="box-none"
          style={styles.dialogOuter}
        >
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
            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={bodyStyle}
              keyboardShouldPersistTaps="handled"
            >
              {retainedChildren}
            </ScrollView>
            {hasFooter ? (
              <View style={styles.sheetFooter}>
                {retainedFooter}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </FastModal>
  );
  /* eslint-enable react-hooks/refs */
};

export const OptionRow = ({
  label,
  selected,
  onPress,
  multi,
  badge,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  multi?: boolean;
  /** A short tag after the label, e.g. "Recommended". */
  badge?: string;
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
      accessibilityRole={multi ? "checkbox" : "radio"}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={badge ? `${label}, ${badge.toLowerCase()}` : label}
    >
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <Text
          numberOfLines={1}
          style={[
            typography.body,
            { color: t.text, flexShrink: 1 },
            selected && { fontWeight: "700" },
          ]}
        >
          {label}
        </Text>
        {badge ? (
          <View
            style={{
              backgroundColor: t.accentSoft,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: t.accent, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
          </View>
        ) : null}
      </View>
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

export const YearPill = ({
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
  badge?: number;
  messageBadge?: number;
};

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

export const FloatingYearPicker = ({
  year,
  years,
  onSelect,
  formatLabel,
  bottomOffset = 0,
}: {
  year: number;
  years: number[];
  onSelect: (year: number) => void;
  formatLabel?: (year: number) => string;
  bottomOffset?: number;
}) => {
  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.floatingYearPicker,
        bottomOffset ? { bottom: spacing.md + bottomOffset } : null,
      ]}
    >
      <YearPill year={year} years={years} onSelect={onSelect} formatLabel={formatLabel} />
    </View>
  );
};
