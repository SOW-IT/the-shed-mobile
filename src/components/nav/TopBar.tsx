import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { type ReactNode, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { UpdateButton } from "@/components/AppUpdatePrompt";
import { Avatar, usePressScale } from "@/components/ui";
import { ActingAsChip } from "@/components/nav/ActingAs";
import { useNavDrawer } from "@/components/nav/NavDrawer";
import { SignInMenu } from "@/components/nav/SignInMenu";
import { TestEnvironmentChip } from "@/components/nav/TestEnvironmentChip";
import { TOP_BAR_HEIGHT } from "@/components/useTopBarCollapse";
import { useMusicRequestsBadge } from "@/hooks/useMusicRequestsBadge";
import { useReimbursementsBadge } from "@/hooks/useReimbursementsBadge";
import { useStaffWaitingBadge } from "@/hooks/useStaffWaitingBadge";
import { badgeText } from "@/lib/navMenu";
import { titleInsets } from "@/lib/screenHeader";
import { radius, spacing, typography, useAppTheme, fixedColours } from "@/theme";

const EDGE_CONTROLS_WIDTH = 60;

export const TopBar = ({
  photo,
  name,
  title,
  right,
  onBack,
}: {
  photo: string | null;
  name: string | null;
  // Shown in the middle, e.g. the month the calendar is on.
  title?: ReactNode;
  right?: ReactNode;
  onBack?: () => void;
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
  const [leftWidth, setLeftWidth] = useState(0);
  const [rightWidth, setRightWidth] = useState(0);
  const titlePad = titleInsets(EDGE_CONTROLS_WIDTH, leftWidth, rightWidth);
  const badge =
    useReimbursementsBadge() +
    useStaffWaitingBadge(api.designRequests.waitingOnMe) +
    useStaffWaitingBadge(api.eventRequests.waitingOnMe) +
    useMusicRequestsBadge();
  return (
    <View style={styles.topBar}>
      <View style={[styles.center, { paddingLeft: titlePad.left, paddingRight: titlePad.right }]} pointerEvents="box-none">
        {title}
        <View style={styles.chipRow} pointerEvents="box-none">
          <TestEnvironmentChip />
          <ActingAsChip />
          <UpdateButton />
        </View>
      </View>
      <View onLayout={(e) => setLeftWidth(e.nativeEvent.layout.width)}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="top-bar-back"
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={26} color={t.text} />
          </Pressable>
        ) : isAuthenticated ? (
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
      </View>
      <View style={styles.rightRow} onLayout={(e) => setRightWidth(e.nativeEvent.layout.width)}>
        {right}
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
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  center: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  rightRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  chipRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs, maxWidth: "100%" },
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
  badgeText: { color: fixedColours.onColour, fontSize: 10, fontWeight: "800" },
});
