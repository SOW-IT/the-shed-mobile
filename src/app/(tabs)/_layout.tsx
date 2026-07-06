import { Ionicons } from "@expo/vector-icons";
import { useConvexAuth, useQuery } from "convex/react";
import { Tabs } from "expo-router";
import {
  AccessibilityState,
  Animated,
  ColorValue,
  GestureResponderEvent,
  Platform,
  Pressable,
  PressableStateCallbackType,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { hapticSelect, LoadingState, usePressScale } from "@/components/ui";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { BOTTOM_TAB_HEIGHT, shadowStyle, useAppTheme } from "@/theme";
import { requestFullyApproved } from "../../../shared/flow";

/** Builds a tab-bar icon that swaps to its filled glyph when the tab is active. */
const tabIcon =
  (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) => {
    const TabBarIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Ionicons name={focused ? filled : outline} size={23} color={color} />
    );
    return TabBarIcon;
  };

/**
 * Requests tab icon: single combined badge summing every action-required count
 * and every unread-message count across all segments (Mine + To Review).
 */
const RequestsTabIcon = ({
  color,
  focused,
  total,
}: {
  color: ColorValue;
  focused: boolean;
  total: number;
}) => {
  const t = useAppTheme();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons name={focused ? "receipt" : "receipt-outline"} size={23} color={color} />
      {total > 0 && (
        <View
          style={{
            position: "absolute",
            top: -6,
            right: -10,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: t.warning,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 3,
          }}
        >
          <Text style={{ color: "#ffffff", fontSize: 10, fontWeight: "800" }}>
            {total > 99 ? "99+" : total}
          </Text>
        </View>
      )}
    </View>
  );
};

/** Insights tab icon with a small "BETA" flag while the dashboard is in beta. */
const InsightsTabIcon = ({
  color,
  focused,
}: {
  color: ColorValue;
  focused: boolean;
}) => {
  const t = useAppTheme();
  return (
    <View style={{ position: "relative" }}>
      <Ionicons
        name={focused ? "stats-chart" : "stats-chart-outline"}
        size={23}
        color={color}
      />
      <View
        style={{
          position: "absolute",
          top: -6,
          right: -15,
          backgroundColor: t.accent,
          borderRadius: 4,
          paddingHorizontal: 3,
          paddingVertical: 0,
        }}
      >
        <Text style={{ color: "#ffffff", fontSize: 6, fontWeight: "800", letterSpacing: 0.2 }}>
          BETA
        </Text>
      </View>
    </View>
  );
};

/** Props the tab navigator hands to a custom `tabBarButton`. */
type TabBarButtonProps = {
  children?:
    | React.ReactNode
    | ((state: PressableStateCallbackType) => React.ReactNode);
  style?: StyleProp<ViewStyle>;
  href?: string | null;
  onPress?: ((e: GestureResponderEvent) => void) | null;
  onPressIn?: ((e: GestureResponderEvent) => void) | null;
  onPressOut?: ((e: GestureResponderEvent) => void) | null;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  accessibilityState?: AccessibilityState;
  accessibilityLabel?: string;
  testID?: string;
  disabled?: boolean | null;
};

const inactivePressableState = { pressed: false, hovered: false, focused: false };

/**
 * Tab-bar button that scales its icon on touch, giving the same press
 * feedback as the top-bar buttons (the default tab button ships with
 * `pressOpacity: 1`, i.e. no visible feedback).
 *
 * On web the button renders as an `<a href>`, so — like the default
 * PlatformPressable — we must `preventDefault()` the click; otherwise the
 * browser does a full-page navigation (reload) instead of letting Expo Router
 * switch tabs client-side.
 */
const AnimatedTabBarButton = ({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  ...rest
}: TabBarButtonProps) => {
  const { scale, onPressIn: scaleIn, onPressOut: scaleOut } = usePressScale();
  const handlePress = (e: GestureResponderEvent) => {
    if (Platform.OS === "web" && rest.href != null) {
      const we = e as unknown as {
        preventDefault?: () => void;
        metaKey?: boolean;
        altKey?: boolean;
        ctrlKey?: boolean;
        shiftKey?: boolean;
        button?: number | null;
      };
      const hasModifier =
        we.metaKey || we.altKey || we.ctrlKey || we.shiftKey;
      const isLeftClick = we.button == null || we.button === 0;
      // Only intercept plain left clicks; let cmd/ctrl/middle-click open a new
      // tab natively.
      if (!hasModifier && isLeftClick) {
        we.preventDefault?.();
        onPress?.(e);
      }
      return;
    }
    onPress?.(e);
  };
  return (
    <Pressable
      {...rest}
      style={[style, styles.tabButton]}
      onPress={handlePress}
      onPressIn={(e) => {
        scaleIn();
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scaleOut();
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[styles.tabButtonInner, { transform: [{ scale }] }]}>
        {typeof children === "function"
          ? children(inactivePressableState)
          : children}
      </Animated.View>
    </Pressable>
  );
};

/**
 * The bottom tab navigator. The app is public (1.7.0): Home is the leftmost tab
 * for EVERYONE — visitors and signed-in users alike (1.7.4), the SOW landing
 * surface anyone can return to. The Org chart and Insights are visible to
 * everyone (Insights shows org-wide trends publicly and gates its per-campus
 * view internally), while Requests and Attendance appear only for signed-in
 * users with a staff profile, and Admin is reached from the Org list (admins /
 * the Finance head). Tab order and the launch tab depend on role: visitors land
 * on Home; signed-in non-staff land on the Org chart (their content tabs are
 * Home + Insights + Org); campus leaders (President / VP / Executive / Student
 * Leader) get Attendance first and no Requests tab; everyone else (staff)
 * launches on Requests.
 */
export default function TabsLayout() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  usePushRegistration();

  const isCampusLeader = me?.isCampusLeader ?? false;
  // The staff tools need a provisioned staff profile, not just a Google
  // account — a visitor who signs in with a personal account sees the same
  // public tabs until an admin provisions them.
  const isStaff = !!me?.profile;

  // Mine: action count (requests fully approved but awaiting receipt submission).
  const myRequests = useQuery(api.requests.myRequests, me?.profile ? {} : "skip");
  const mineActionCount = (myRequests ?? []).filter(
    (r) => requestFullyApproved(r) && !r.receipt
  ).length;
  const mineUnread =
    useQuery(api.comments.myUnreadTotal, me?.profile ? {} : "skip") ?? 0;

  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
  const reviewActionCount = review
    ? review.hod.length +
      review.budgetManager.length +
      review.director.length +
      review.financeHead.length +
      review.readyToPay.length
    : 0;
  const reviewRequestIds = review
    ? [
        ...review.hod.map((r) => r._id),
        ...review.budgetManager.map((r) => r._id),
        ...review.director.map((r) => r._id),
        ...review.financeHead.map((r) => r._id),
        ...review.readyToPay.map((r) => r._id),
      ]
    : [];
  const reviewUnread =
    useQuery(
      api.comments.unreadTotalForRequests,
      me?.profile && me.isApprover && review ? { requestIds: reviewRequestIds } : "skip"
    ) ?? 0;

  const tabTotal = mineActionCount + mineUnread + reviewActionCount + reviewUnread;

  // `initialRouteName` is read once when Tabs mounts, so wait for `me` to
  // resolve before mounting — otherwise a signed-in campus leader can briefly
  // land on Requests (or a hidden tab) before their role loads.
  if (isAuthenticated && me === undefined) {
    return <LoadingState />;
  }

  return (
    <Tabs
      initialRouteName={
        !isAuthenticated
          ? "home"
          : !isStaff
            ? "org"
            : isCampusLeader
              ? "attendance"
              : "index"
      }
      backBehavior="history"
      screenListeners={{ tabPress: () => hapticSelect() }}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.faint,
        tabBarButton: (props) => <AnimatedTabBarButton {...props} />,
        tabBarBadgeStyle: {
          backgroundColor: t.accent,
          color: "#ffffff",
          fontSize: 11,
          fontWeight: "700",
        },
        tabBarStyle: {
          backgroundColor: t.card,
          borderTopWidth: 0,
          height: BOTTOM_TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
          ...shadowStyle(t.dark ? "#000000" : "#0F2523", t.dark ? 0.35 : 0.08, 16, -4, 12),
        },
      }}
    >
      {/* Keep screens in a fixed declaration order so Expo Router registers tab
          bar slots correctly. Hidden tabs use href: null (they don't appear in
          the bar but still occupy their slot in the route list). */}
      {/* Home is the leftmost tab for everyone — visitors and signed-in users
          (1.7.4), so anyone can return to the SOW landing surface. */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: tabIcon("home-outline", "home"),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Requests",
          ...(!isStaff || isCampusLeader ? { href: null } : {}),
          tabBarIcon: ({ color, focused }) => (
            <RequestsTabIcon color={color} focused={focused} total={tabTotal} />
          ),
        }}
      />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          ...(isStaff ? {} : { href: null }),
          tabBarIcon: tabIcon("checkbox-outline", "checkbox"),
        }}
      />
      {/* Insights is public: the org-wide General trends are open to everyone,
          while the per-campus Attendance view inside stays staff-only. */}
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, focused }) => (
            <InsightsTabIcon color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="org"
        options={{
          title: "Org Chart",
          tabBarIcon: tabIcon("people-outline", "people"),
        }}
      />
      {/* Admin is reachable from a button at the top of the Org list (shown
          only to admins / the Finance head), not from the tab bar — href:null
          keeps the route navigable without a bottom-bar slot. */}
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          href: null,
          tabBarIcon: tabIcon("settings-outline", "settings"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    paddingVertical: 0,
  },
  tabButtonInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
