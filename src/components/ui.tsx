import { ConvexError } from "convex/values";
import { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const errorMessage = (e: unknown): string =>
  e instanceof ConvexError
    ? String(e.data)
    : e instanceof Error
      ? e.message
      : "Something went wrong";

export const Screen = ({ children }: { children?: ReactNode }) => (
  <SafeAreaView style={styles.screen} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.scroll}>{children}</ScrollView>
  </SafeAreaView>
);

export const Card = ({ children }: { children: ReactNode }) => (
  <View style={styles.card}>{children}</View>
);

export const SectionTitle = ({ children }: { children: ReactNode }) => (
  <Text style={styles.sectionTitle}>{children}</Text>
);

export const Row = ({ children }: { children: ReactNode }) => (
  <View style={styles.row}>{children}</View>
);

export const Btn = ({
  title,
  onPress,
  variant = "primary",
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost" | "success";
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={({ pressed }) => [
      styles.btn,
      variant === "primary" && styles.btnPrimary,
      variant === "success" && styles.btnSuccess,
      variant === "danger" && styles.btnDanger,
      variant === "ghost" && styles.btnGhost,
      (pressed || disabled) && { opacity: 0.6 },
    ]}
  >
    <Text style={[styles.btnText, variant === "ghost" && styles.btnGhostText]}>
      {title}
    </Text>
  </Pressable>
);

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
}) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <TextInput
      style={[styles.input, multiline && styles.inputMultiline]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      keyboardType={keyboardType}
      autoCapitalize="none"
      multiline={multiline}
    />
  </View>
);

const chipColors: Record<string, { bg: string; fg: string }> = {
  PAID: { bg: "#dcfce7", fg: "#166534" },
  DECLINED: { bg: "#fee2e2", fg: "#991b1b" },
  default: { bg: "#fef3c7", fg: "#92400e" },
};

export const Chip = ({ label }: { label: string }) => {
  const colors = chipColors[label] ?? chipColors.default;
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.chipText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
};

export const ErrorBanner = ({ message }: { message: string | null }) =>
  message ? (
    <View style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  ) : null;

export const Muted = ({ children }: { children: ReactNode }) => (
  <Text style={styles.muted}>{children}</Text>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  scroll: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 720, width: "100%", alignSelf: "center" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: "center",
  },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnSuccess: { backgroundColor: "#16a34a" },
  btnDanger: { backgroundColor: "#dc2626" },
  btnGhost: { backgroundColor: "#e5e7eb" },
  btnText: { color: "#ffffff", fontWeight: "600" },
  btnGhostText: { color: "#111827" },
  field: { gap: 4 },
  fieldLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#ffffff",
    color: "#111827",
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
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: "#991b1b" },
  muted: { color: "#6b7280", fontSize: 13 },
});
