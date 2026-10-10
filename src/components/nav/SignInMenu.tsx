import { Ionicons } from "@expo/vector-icons";
import { ReactNode, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { FastModal, SowSpinner } from "@/components/ui";
import {
  useAppleSignIn,
  useAppleSignInAvailable,
} from "@/hooks/useAppleSignIn";
import { type SignInOutcome, useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { radius, spacing, typography, useAppTheme } from "@/theme";

export type SignInMenuAnchor = { top: number; left: number };

/**
 * The sign-in choices (SOW account, Apple) as a small menu
 * dropping from wherever `anchor` puts it. `children` renders the button that
 * opens it.
 */
export const SignInMenu = ({
  anchor,
  children,
}: {
  anchor: SignInMenuAnchor;
  children: (open: () => void) => ReactNode;
}) => {
  const t = useAppTheme();
  const [visible, setVisible] = useState(false);
  const sow = useGoogleSignIn();
  const apple = useAppleSignIn();
  const appleAvailable = useAppleSignInAvailable();
  const busy = sow.busy || apple.busy;
  const error = sow.error ?? apple.error;
  const clearError = () => {
    sow.clearError();
    apple.clearError();
  };
  const open = () => {
    clearError();
    setVisible(true);
  };
  const dismiss = () => {
    if (busy) return;
    setVisible(false);
    clearError();
  };
  const signInAndClose = async (
    signIn: () => Promise<SignInOutcome>,
    kind: "sow" | "apple"
  ) => {
    setVisible(false);
    clearError();
    const outcome = await signIn();
    if (outcome === "rejected") {
      if (kind === "apple") {
        Alert.alert(
          "Use your SOW account",
          "That looks like a SOW organisation account. Please tap “Sign in with your SOW account” to sign in with it.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "SOW account required",
          appleAvailable
            ? "Only SOW organisation accounts can sign in here. To browse as a guest, tap “Sign in with Apple” instead."
            : "Only SOW organisation accounts can sign in here.",
          [{ text: "OK" }]
        );
      }
    } else if (outcome === "error") {
      Alert.alert(
        "Sign-in failed",
        "Something went wrong signing you in. Please try again.",
        [{ text: "OK" }]
      );
    }
  };
  return (
    <>
      {children(open)}
      <FastModal visible={visible} onRequestClose={dismiss}>
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Close menu"
          accessible={false}
          onPress={dismiss}
        >
          <View
            accessibilityViewIsModal
            accessibilityActions={[{ name: "escape", label: "Close menu" }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "escape") dismiss();
            }}
            style={[
              styles.menu,
              t.shadowFloat,
              { backgroundColor: t.card, top: anchor.top, left: anchor.left },
            ]}
          >
            <Pressable
              disabled={busy}
              onPress={() => void signInAndClose(sow.signInWithGoogle, "sow")}
              accessibilityRole="button"
              accessibilityLabel="Sign in with your SOW account"
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
            >
              {sow.busy ? (
                <SowSpinner size={18} onDark={t.dark} />
              ) : (
                <Ionicons name="logo-google" size={18} color={t.text} />
              )}
              <Text style={[typography.headline, { color: t.text }]}>
                Sign in with your SOW account
              </Text>
            </Pressable>
            {appleAvailable ? (
              <>
                <View style={[styles.divider, { backgroundColor: t.separator }]} />
                <Pressable
                  disabled={busy}
                  onPress={() => void signInAndClose(apple.signInWithApple, "apple")}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with Apple"
                  style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
                >
                  {apple.busy ? (
                    <SowSpinner size={18} onDark={t.dark} />
                  ) : (
                    <Ionicons name="logo-apple" size={18} color={t.text} />
                  )}
                  <Text style={[typography.headline, { color: t.text }]}>
                    Sign in with Apple
                  </Text>
                </Pressable>
              </>
            ) : null}
            {error ? (
              <Text style={[typography.caption, styles.error, { color: t.errorText }]}>
                {error}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </FastModal>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    position: "absolute",
    borderRadius: radius.md,
    paddingVertical: spacing.xs,
    minWidth: 220,
    maxWidth: 300,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.lg,
  },
  error: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
