import { SignInMenu } from "@/components/nav/SignInMenu";
import { TestEnvironmentChip } from "@/components/nav/TestEnvironmentChip";
import { Avatar, ConfirmDialog } from "@/components/ui";
import { useDesignRequestsBadge } from "@/hooks/useDesignRequestsBadge";
import { useEventRequestsBadge } from "@/hooks/useEventRequestsBadge";
import { useNavGroupOpen } from "@/hooks/useNavGroupOpen";
import { useSignOut } from "@/hooks/usePushRegistration";
import { useReimbursementsBadge } from "@/hooks/useReimbursementsBadge";
import {
  activeNavKey,
  badgeText,
  drawerItems,
  NAV_GROUP_LABELS,
  NAV_HREFS,
  NAV_LABELS,
  navEntries,
  type NavGroupKey,
  type NavKey,
  navViewer,
  roleLine,
  sidebarItems,
} from "@/lib/navMenu";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useQuery } from "convex/react";
import { type Href, usePathname, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";

type IconName = keyof typeof Ionicons.glyphMap;

const NAV_ICONS: Record<NavKey, { outline: IconName; filled: IconName }> = {
  home: { outline: "home-outline", filled: "home" },
  music: { outline: "musical-notes-outline", filled: "musical-notes" },
  reimbursements: { outline: "receipt-outline", filled: "receipt" },
  designRequests: { outline: "color-palette-outline", filled: "color-palette" },
  eventRequests: { outline: "calendar-outline", filled: "calendar" },
  attendance: { outline: "checkbox-outline", filled: "checkbox" },
  insights: { outline: "stats-chart-outline", filled: "stats-chart" },
  org: { outline: "people-outline", filled: "people" },
  profile: { outline: "person-outline", filled: "person" },
  churches: { outline: "business-outline", filled: "business" },
  mentoring: { outline: "compass-outline", filled: "compass" },
  announcements: { outline: "megaphone-outline", filled: "megaphone" },
  admin: { outline: "settings-outline", filled: "settings" },
};

const TAB_KEYS: ReadonlySet<NavKey> = new Set<NavKey>([
  "home",
  "music",
  "reimbursements",
  "designRequests",
  "eventRequests",
  "profile",
  "churches",
  "attendance",
  "insights",
  "org",
  "mentoring",
  "admin",
]);

const GROUP_ICONS: Record<
  NavGroupKey,
  { outline: IconName; filled: IconName }
> = {
  requests: { outline: "file-tray-full-outline", filled: "file-tray-full" },
};

type NavMenuVariant = "drawer" | "sidebar";

const CountBadge = ({ count }: { count: number }) => {
  const t = useAppTheme();
  return count > 0 ? (
    <View style={[styles.countBadge, { backgroundColor: t.warning }]}>
      <Text style={styles.badgeText}>{badgeText(count)}</Text>
    </View>
  ) : null;
};

const NavItemRow = ({
  icon,
  label,
  selected,
  badge,
  sidebar,
  nested,
  onPress,
}: {
  icon: { outline: IconName; filled: IconName };
  label: string;
  selected: boolean;
  badge: number;
  sidebar: boolean;
  nested?: boolean;
  onPress: () => void;
}) => {
  const t = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={badge > 0 ? `${label}, ${badge} to action` : label}
      style={({ pressed }) => [
        styles.item,
        sidebar ? styles.itemSidebar : styles.itemDrawer,
        nested && (sidebar ? styles.nestedSidebar : styles.nestedDrawer),
        selected && { backgroundColor: t.primarySoft },
        pressed && { opacity: 0.6 },
      ]}
    >
      <Ionicons
        name={selected ? icon.filled : icon.outline}
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
      <CountBadge count={badge} />
    </Pressable>
  );
};

const NavGroupRows = ({
  group,
  items,
  active,
  sidebar,
  badgeFor,
  onSelect,
}: {
  group: NavGroupKey;
  items: NavKey[];
  active: NavKey | null;
  sidebar: boolean;
  badgeFor: (key: NavKey) => number;
  onSelect: (key: NavKey) => void;
}) => {
  const t = useAppTheme();
  const containsActive = active !== null && items.includes(active);
  const [open, toggle] = useNavGroupOpen(group, containsActive);
  const label = NAV_GROUP_LABELS[group];
  const total = items.reduce((sum, key) => sum + badgeFor(key), 0);
  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          !open && total > 0 ? `${label}, ${total} to action` : label
        }
        style={({ pressed }) => [
          styles.item,
          sidebar ? styles.itemSidebar : styles.itemDrawer,
          !open && containsActive && { backgroundColor: t.primarySoft },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Ionicons
          name={
            !open && containsActive
              ? GROUP_ICONS[group].filled
              : GROUP_ICONS[group].outline
          }
          size={sidebar ? 24 : 26}
          color={t.text}
        />
        <Text
          numberOfLines={1}
          style={[
            sidebar ? styles.labelSidebar : styles.labelDrawer,
            { color: t.text },
            !open && containsActive && styles.labelSelected,
          ]}
        >
          {label}
        </Text>
        {open ? null : <CountBadge count={total} />}
        <View style={styles.chevron}>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={t.muted}
          />
        </View>
      </Pressable>
      {open
        ? items.map((key) => (
            <NavItemRow
              key={key}
              icon={NAV_ICONS[key]}
              label={NAV_LABELS[key]}
              selected={key === active}
              badge={badgeFor(key)}
              sidebar={sidebar}
              nested
              onPress={() => onSelect(key)}
            />
          ))
        : null}
    </View>
  );
};

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
  const signOut = useSignOut();
  const me = useQuery(api.directory.me);
  const viewer = navViewer(isAuthenticated, me);
  const reimbursementsBadge = useReimbursementsBadge();
  const designRequestsBadge = useDesignRequestsBadge();
  const eventRequestsBadge = useEventRequestsBadge();
  const unread =
    useQuery(api.notifications.unreadCount, viewer.isStaff ? {} : "skip") ?? 0;
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  const sidebar = variant === "sidebar";
  const items = sidebar ? sidebarItems(viewer) : drawerItems(viewer);
  const active = activeNavKey(pathname);
  const role = roleLine(me?.profile, me?.roleTitles);
  const badgeFor = (key: NavKey) =>
    key === "reimbursements"
      ? reimbursementsBadge
      : key === "designRequests"
        ? designRequestsBadge
        : key === "eventRequests"
          ? eventRequestsBadge
          : 0;

  const go = (key: NavKey) => {
    onNavigate?.();
    const href = NAV_HREFS[key] as Href;
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
          <Avatar
            photo={me?.photo ?? null}
            name={me?.name ?? null}
            size={avatarSize}
          />
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
          style={[
            sidebar ? styles.nameSidebar : styles.name,
            { color: t.text },
          ]}
        >
          {me?.name ?? me?.email ?? ""}
        </Text>
        {role ? (
          <Text
            numberOfLines={2}
            style={[typography.caption, { color: t.muted }]}
          >
            {role}
          </Text>
        ) : null}
      </Pressable>
    </View>
  ) : (
    <SignInMenu
      anchor={{
        top: insets.top + spacing.lg + avatarSize + 40,
        left: spacing.lg,
      }}
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
          <Text
            style={[
              sidebar ? styles.nameSidebar : styles.name,
              { color: t.text },
            ]}
          >
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
        <View style={styles.chip}>
          <TestEnvironmentChip />
        </View>
      ) : null}
      <View style={styles.items}>
        {navEntries(items).map((entry) =>
          entry.kind === "group" ? (
            <NavGroupRows
              key={entry.key}
              group={entry.key}
              items={entry.items}
              active={active}
              sidebar={sidebar}
              badgeFor={badgeFor}
              onSelect={go}
            />
          ) : (
            <NavItemRow
              key={entry.key}
              icon={NAV_ICONS[entry.key]}
              label={NAV_LABELS[entry.key]}
              selected={entry.key === active}
              badge={badgeFor(entry.key)}
              sidebar={sidebar}
              onPress={() => go(entry.key)}
            />
          ),
        )}
      </View>
      {viewer.signedIn ? (
        <>
          <View style={[styles.divider, { backgroundColor: t.separator }]} />
          <Pressable
            onPress={() => setConfirmingSignOut(true)}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={({ pressed }) => [
              styles.item,
              styles.minorItem,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="log-out-outline" size={22} color={t.text} />
            <Text style={[styles.minorLabel, { color: t.text }]}>Sign out</Text>
          </Pressable>
          <ConfirmDialog
            visible={confirmingSignOut}
            title="Sign out of The SHED?"
            confirmLabel="Sign out"
            onConfirm={() => {
              onNavigate?.();
              void signOut()
                .then(() => router.replace("/home"))
                .catch(() => {
                  Alert.alert(
                    "Sign-out failed",
                    "Something went wrong signing you out. Please try again.",
                    [{ text: "OK" }],
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
  name: { ...typography.title, fontSize: 20 },
  nameSidebar: { ...typography.headline, fontSize: 17 },
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
  labelDrawer: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  labelSidebar: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
    flexShrink: 1,
  },
  labelSelected: { fontWeight: "800" },
  nestedDrawer: { paddingLeft: spacing.sm + spacing.xl },
  nestedSidebar: { paddingLeft: spacing.sm + spacing.lg },
  chevron: { marginLeft: "auto" },
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
