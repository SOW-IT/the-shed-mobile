import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Sheet, Txt } from "@/components/ui";
import { IS_DEV_ENVIRONMENT } from "@/env";
import { radius, spacing, useAppTheme } from "@/theme";

/**
 * The orange "Test Environment" chip on dev builds; tapping it explains what
 * the dev app is. Renders nothing on the live app.
 */
export const TestEnvironmentChip = () => {
  const t = useAppTheme();
  const [info, setInfo] = useState(false);
  if (!IS_DEV_ENVIRONMENT) return null;
  return (
    <>
      <Pressable
        onPress={() => setInfo(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Test environment. What is this?"
        style={({ pressed }) => [
          styles.chip,
          { backgroundColor: t.warning },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="construct" size={12} color="#ffffff" />
        <Text style={styles.chipText}>Test Environment</Text>
      </Pressable>
      <Sheet
        visible={info}
        onClose={() => setInfo(false)}
        title="Development Environment"
      >
        <View style={{ gap: spacing.sm }}>
          <Txt>
            You&apos;re using the development (test) version of THE SHED, kept
            separate from the live app for trying things out.
          </Txt>
          <Txt style={{ color: t.muted }}>
            It runs against its own test database, so anything you create,
            edit, or delete here won&apos;t affect the live app or real staff
            data.
          </Txt>
          <Txt style={{ color: t.muted }}>
            The live app lives at theshed.sow.org.au.
          </Txt>
        </View>
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  chipText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
});
