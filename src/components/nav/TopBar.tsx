import { Ionicons } from "@expo/vector-icons";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { Avatar, usePressScale } from "@/components/ui";
import { useNavDrawer } from "@/components/nav/NavDrawer";
import { SignInMenu } from "@/components/nav/SignInMenu";
import { TestEnvironmentChip } from "@/components/nav/TestEnvironmentChip";
import { TOP_BAR_HEIGHT } from "@/components/useTopBarCollapse";
import { useDesignRequestsBadge } from "@/hooks/useDesignRequestsBadge";
import { useEventRequestsBadge } from "@/hooks/useEventRequestsBadge";
import { useReimbursementsBadge } from "@/hooks/useReimbursementsBadge";
import { badgeText } from "@/lib/navMenu";
import { radius, spacing, typography, useAppTheme } from "@/theme";

/**
 * The phone's top bar on tab screens: your avatar on the left opens the side
 * menu (signed out, it's the Sign in button), the bell sits on the right.
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
  const insets = useSafeAreaInsets();
  const menu = usePressScale();
  const bell = usePressScale();
  const drawer = useNavDrawer();
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const isStaff = !!me?.profile;
  const unread =
    useQuery(api.notifications.unreadCount, isStaff ? {} : "skip") ?? 0;
  const badge = useReimbursementsBadge() + useDesignRequestsBadge() + useEventRequestsBadge();
  return (
    <View style={styles.topBar}>
      <View style={styles.center} pointerEvents="box-none">
        <TestEnvironmentChip />
      </View>
      {isAuthenticated ? (
        <Animated.View style={{ transform: [{ scale: menu.scale }] }}>
          <Pressable
            onPress={drawer.open}
            onPressIn={menu.onPressIn}
            onPressOut={menu.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={badge > 0 ? `Open menu, ${badge} to action` : "Open menu"}
          >
            <Avatar photo={photo} name={name} size={40} />
            {badge > 0 ? (
              <View style={[styles.badge, { backgroundColor: t.warning }]}>
                <Text style={styles.badgeText}>{badgeText(badge)}</Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : (
        <SignInMenu anchor={{ top: insets.top + TOP_BAR_HEIGHT, left: spacing.lg }}>
          {(openSignIn) => (
            <Pressable
              onPress={openSignIn}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              style={({ pressed }) => [
                styles.signInButton,
                { backgroundColor: t.primary },
                pressed && { opacity: 0.85 },
              ]}
            >
              <Ionicons name="log-in-outline" size={16} color={t.onPrimary} />
              <Text style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}>
                Sign in
              </Text>
            </Pressable>
          )}
        </SignInMenu>
      )}
      {isStaff ? (
        <Animated.View style={{ transform: [{ scale: bell.scale }] }}>
          <Pressable
            onPress={() => router.push("/notifications")}
            onPressIn={bell.onPressIn}
            onPressOut={bell.onPressOut}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
          >
            <Ionicons
              name={unread > 0 ? "notifications" : "notifications-outline"}
              size={24}
              color={t.text}
            />
            {unread > 0 ? (
              <View style={[styles.badge, { backgroundColor: t.accent }]}>
                <Text style={styles.badgeText}>{badgeText(unread)}</Text>
              </View>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 48,
    paddingVertical: spacing.sm,
  },
  // Centred on the whole bar, whatever sits on either side.
  center: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  signInButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.full,
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#ffffff", fontSize: 10, fontWeight: "800" },
});
