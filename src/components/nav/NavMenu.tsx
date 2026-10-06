import { Ionicons } from "@expo/vector-icons";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { type Href, usePathname, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { Avatar, ConfirmDialog } from "@/components/ui";
import { SignInMenu } from "@/components/nav/SignInMenu";
import { TestEnvironmentChip } from "@/components/nav/TestEnvironmentChip";
import { useDesignRequestsBadge } from "@/hooks/useDesignRequestsBadge";
import { useReimbursementsBadge } from "@/hooks/useReimbursementsBadge";
import {
  activeNavKey,
  badgeText,
  drawerItems,
  NAV_HREFS,
  NAV_LABELS,
  type NavKey,
  navViewer,
  roleLine,
  sidebarItems,
} from "@/lib/navMenu";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type IconName = keyof typeof Ionicons.glyphMap;

const NAV_ICONS: Record<NavKey, { outline: IconName; filled: IconName }> = {
  home: { outline: "home-outline", filled: "home" },
  reimbursements: { outline: "receipt-outline", filled: "receipt" },
  designRequests: { outline: "color-palette-outline", filled: "color-palette" },
  attendance: { outline: "checkbox-outline", filled: "checkbox" },
  insights: { outline: "stats-chart-outline", filled: "stats-chart" },
  org: { outline: "people-outline", filled: "people" },
  profile: { outline: "person-outline", filled: "person" },
  admin: { outline: "settings-outline", filled: "settings" },
};

/** Links that switch the bottom-tab screen rather than open a screen on top. */
const TAB_KEYS: ReadonlySet<NavKey> = new Set<NavKey>([
  "home",
  "reimbursements",
  "designRequests",
  "profile",
  "attendance",
  "insights",
  "org",
  "admin",
]);

export type NavMenuVariant = "drawer" | "sidebar";

/**
 * The side menu's contents, shared by the phone drawer and the wide-screen
 * sidebar: who you are, the links you can use, and Sign out. `onNavigate` runs
 * before any link is followed (the drawer closes itself with it). It scrolls
 * when it's taller than the screen (a short window, large text), so the
 * caller passes the safe-area gaps to keep clear of at either end.
 */
export const NavMenu = ({
  variant,
  onNavigate,
  paddingTop,
  paddingBottom,
}: {
  variant: NavMenuVariant;
  onNavigate?: () => void;
  paddingTop: number;
  paddingBottom: number;
}) => {
  const t = useAppTheme();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const me = useQuery(api.directory.me);
  const viewer = navViewer(isAuthenticated, me);
  const reimbursementsBadge = useReimbursementsBadge();
  const designRequestsBadge = useDesignRequestsBadge();
  const unread =
    useQuery(api.notifications.unreadCount, viewer.isStaff ? {} : "skip") ?? 0;
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const sidebar = variant === "sidebar";
  const items = sidebar ? sidebarItems(viewer) : drawerItems(viewer);
  const active = activeNavKey(pathname);
  const role = roleLine(me?.profile);

  const go = (key: NavKey) => {
    onNavigate?.();
    const href = NAV_HREFS[key] as Href;
    // A tab can't be pushed over a screen that's already on top of the tabs
    // (a request, a person…): drop back to the tabs first, then switch.
    if (TAB_KEYS.has(key) && router.canDismiss()) router.dismissAll();
    router.navigate(href);
  };

  const openNotifications = () => {
    onNavigate?.();
    router.navigate("/notifications");
  };

  const avatarSize = sidebar ? 48 : 56;

  const header = viewer.signedIn ? (
    <View style={[styles.header, !sidebar && styles.headerDrawer]}>
      <View style={styles.headerTop}>
        <Pressable
          onPress={() => go("profile")}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          style={({ pressed }) => pressed && { opacity: 0.7 }}
        >
          <Avatar photo={me?.photo ?? null} name={me?.name ?? null} size={avatarSize} />
        </Pressable>
        {sidebar && viewer.isStaff ? (
          <Pressable
            onPress={openNotifications}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
            style={({ pressed }) => [styles.bell, pressed && { opacity: 0.6 }]}
          >
            <Ionicons
              name={unread > 0 ? "notifications" : "notifications-outline"}
              size={24}
              color={t.text}
            />
            {unread > 0 ? (
              <View style={[styles.bellBadge, { backgroundColor: t.accent }]}>
                <Text style={styles.badgeText}>{badgeText(unread)}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={() => go("profile")}
        accessible={false}
        style={({ pressed }) => pressed && { opacity: 0.7 }}
      >
        <Text
          numberOfLines={1}
          style={[sidebar ? styles.nameSidebar : styles.name, { color: t.text }]}
        >
          {me?.name ?? me?.email ?? ""}
        </Text>
        {role ? (
          <Text numberOfLines={2} style={[typography.caption, { color: t.muted }]}>
            {role}
          </Text>
        ) : null}
      </Pressable>
    </View>
  ) : (
    // Drops just below the "Sign in" label (sidebar padding + avatar + label).
    <SignInMenu
      anchor={{ top: insets.top + spacing.lg + avatarSize + 40, left: spacing.lg }}
    >
      {(openSignIn) => (
        <Pressable
          onPress={openSignIn}
          accessibilityRole="button"
          accessibilityLabel="Sign in"
          style={({ pressed }) => [styles.header, pressed && { opacity: 0.7 }]}
        >
          <View
            style={[
              styles.blankAvatar,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                backgroundColor: t.inputBackground,
              },
            ]}
          >
            <Ionicons name="person" size={avatarSize * 0.5} color={t.faint} />
          </View>
          <Text style={[sidebar ? styles.nameSidebar : styles.name, { color: t.text }]}>
            Sign in
          </Text>
        </Pressable>
      )}
    </SignInMenu>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.menu, { paddingTop, paddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {header}
      {sidebar ? (
        // Wide screens have no top bar, so the dev chip lives here instead.
        <View style={styles.chip}>
          <TestEnvironmentChip />
        </View>
      ) : null}
      <View style={styles.items}>
        {items.map((key) => {
          const selected = key === active;
          const badge =
            key === "reimbursements"
              ? reimbursementsBadge
              : key === "designRequests"
                ? designRequestsBadge
                : 0;
          const label = NAV_LABELS[key];
          return (
            <Pressable
              key={key}
              onPress={() => go(key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={badge > 0 ? `${label}, ${badge} to action` : label}
              style={({ pressed }) => [
                styles.item,
                sidebar ? styles.itemSidebar : styles.itemDrawer,
                selected && { backgroundColor: t.primarySoft },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Ionicons
                name={selected ? NAV_ICONS[key].filled : NAV_ICONS[key].outline}
                size={sidebar ? 24 : 26}
                color={t.text}
              />
              <Text
                numberOfLines={1}
                style={[
                  sidebar ? styles.labelSidebar : styles.labelDrawer,
                  { color: t.text },
                  selected && styles.labelSelected,
                ]}
              >
                {label}
              </Text>
              {key === "insights" && sidebar ? (
                <View style={[styles.tag, { backgroundColor: t.accent }]}>
                  <Text style={styles.tagText}>BETA</Text>
                </View>
              ) : null}
              {badge > 0 ? (
                <View style={[styles.countBadge, { backgroundColor: t.warning }]}>
                  <Text style={styles.badgeText}>{badgeText(badge)}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {viewer.signedIn ? (
        <>
          <View style={[styles.divider, { backgroundColor: t.separator }]} />
          <Pressable
            onPress={() => setConfirmingSignOut(true)}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={({ pressed }) => [styles.item, styles.minorItem, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="log-out-outline" size={22} color={t.text} />
            <Text style={[styles.minorLabel, { color: t.text }]}>Sign out</Text>
          </Pressable>
          <ConfirmDialog
            visible={confirmingSignOut}
            title="Sign out of The Shed?"
            confirmLabel="Sign out"
            onConfirm={() => {
              onNavigate?.();
              void signOut()
                .then(() => router.replace("/home"))
                .catch(() => {
                  Alert.alert(
                    "Sign-out failed",
                    "Something went wrong signing you out. Please try again.",
                    [{ text: "OK" }]
                  );
                });
            }}
            onClose={() => setConfirmingSignOut(false)}
          />
        </>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  menu: { paddingHorizontal: spacing.lg },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  headerDrawer: { paddingBottom: spacing.xxl },
  chip: {
    flexDirection: "row",
    paddingHorizontal: spacing.sm,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  blankAvatar: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  name: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  nameSidebar: { fontSize: 17, fontWeight: "800", letterSpacing: -0.3 },
  bell: { padding: spacing.xs },
  bellBadge: {
    position: "absolute",
    top: -1,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  items: { gap: 2 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  itemDrawer: { gap: spacing.xl, paddingVertical: spacing.md + 2 },
  itemSidebar: { gap: spacing.lg, paddingVertical: spacing.sm + 2 },
  labelDrawer: { fontSize: 21, fontWeight: "700", letterSpacing: -0.4, flexShrink: 1 },
  labelSidebar: { fontSize: 17, fontWeight: "600", letterSpacing: -0.3, flexShrink: 1 },
  labelSelected: { fontWeight: "800" },
  tag: { borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  tagText: { color: "#ffffff", fontSize: 9, fontWeight: "800", letterSpacing: 0.2 },
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: spacing.sm,
    marginVertical: spacing.lg,
  },
  minorItem: { gap: spacing.lg, paddingVertical: spacing.sm + 2 },
  minorLabel: { fontSize: 16, fontWeight: "500" },
});
