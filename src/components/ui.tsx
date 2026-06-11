import { ConvexError } from "convex/values";
import { ReactNode } from "react";
import {
  Image,
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

export const errorMessage = (e: unknown): string =>
  e instanceof ConvexError
    ? String(e.data)
    : e instanceof Error
      ? e.message
      : "Something went wrong";

/** Text that follows the system theme. Use instead of the raw <Text>. */
export const Txt = ({ style, ...props }: TextProps) => {
  const t = useAppTheme();
  return <Text {...props} style={[{ color: t.text }, style]} />;
};

export const Screen = ({ children }: { children?: ReactNode }) => {
  const t = useAppTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>{children}</ScrollView>
    </SafeAreaView>
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
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "danger" | "ghost" | "success";
  disabled?: boolean;
}) => {
  const t = useAppTheme();
  const background = {
    primary: t.primary,
    success: t.success,
    danger: t.danger,
    ghost: t.ghost,
  }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: background },
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.btnText, { color: variant === "ghost" ? t.ghostText : "#ffffff" }]}>
        {title}
      </Text>
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
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: t.muted }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          {
            borderColor: t.border,
            backgroundColor: t.inputBackground,
            color: t.text,
          },
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
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
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
    borderWidth: 1,
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
});
