import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
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
import { hapticSelect, usePressScale } from "@/components/ui";
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
        {children as React.ReactNode}
      </Animated.View>
    </Pressable>
  );
};

/**
 * The bottom tab navigator: Requests, Org Chart, Admin. Detail screens
 * (profile, person, request) live in the parent Stack so they push as cards
 * with a native, interactive swipe-back over the tabs.
 */
export default function TabsLayout() {
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  usePushRegistration();
  // Mine: action count (requests fully approved but awaiting receipt submission).
  const myRequests = useQuery(api.requests.myRequests, me?.profile ? {} : "skip");
  const mineActionCount = (myRequests ?? []).filter(
    (r) => requestFullyApproved(r) && !r.receipt
  ).length;
  // Mine: unread comment count across the user's own requests.
  const mineUnread =
    useQuery(api.comments.myUnreadTotal, me?.profile ? {} : "skip") ?? 0;

  // To Review: action count (requests waiting on the approver).
  // Convex dedupes this subscription with the Requests tab's own query.
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
  // To Review: unread comment count across the review queue.
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

  // Combined tab badge: every action + every unread message across both segments.
  const tabTotal = mineActionCount + mineUnread + reviewActionCount + reviewUnread;
  return (
    <Tabs
      // Back (browser back / Android hardware back) returns to the last
      // visited tab rather than always the first tab.
      backBehavior="history"
      // Haptics are reserved for the bottom bar: a light selection tick on
      // every tab press (no other button in the app buzzes).
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
          // Reserve the safe-area inset as bottom padding so the icons centre in
          // the BOTTOM_TAB_HEIGHT band up top instead of in the full (inset-
          // inflated) height — otherwise they sit low with a big gap above them
          // on devices with a home indicator. Web has no inset, so it's unchanged.
          paddingBottom: insets.bottom,
          paddingTop: 0,
          ...shadowStyle(t.dark ? "#000000" : "#0F2523", t.dark ? 0.35 : 0.08, 16, -4, 12),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Requests",
          tabBarIcon: ({ color, focused }) => (
            <RequestsTabIcon color={color} focused={focused} total={tabTotal} />
          ),
          // Both counts are rendered inline by RequestsTabIcon; no tabBarBadge needed.
        }}
      />
      <Tabs.Screen
        name="org"
        options={{
          title: "Org Chart",
          tabBarIcon: tabIcon("people-outline", "people"),
        }}
      />
      <Tabs.Screen
        name="rollcall"
        options={{
          title: "Roll-call",
          tabBarIcon: tabIcon("checkbox-outline", "checkbox"),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          // Admins get the full Manage screen; the Finance Head gets a
          // restricted view (Budget Manager only). When visible we OMIT `href`
          // so the tab uses our custom AnimatedTabBarButton like the others
          // (same height + press feedback) — expo-router swaps in its own Link
          // button for any screen that sets `href`, which renders taller and
          // without the scale feedback. The auto-built "/admin" href is still
          // passed to our button, so the link target is unchanged.
          ...(me?.isAdmin || me?.isFinanceHead ? {} : { href: null }),
          tabBarIcon: tabIcon("settings-outline", "settings"),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // Trim the default tab button's vertical padding so the bar can be shorter.
  tabButton: {
    paddingVertical: 0,
  },
  // Fills the tab slot so the scaled icon stays centered.
  tabButtonInner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
