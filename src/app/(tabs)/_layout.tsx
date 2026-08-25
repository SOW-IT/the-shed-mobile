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

const tabIcon =
  (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) => {
    const TabBarIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Ionicons name={focused ? filled : outline} size={23} color={color} />
    );
    return TabBarIcon;
  };

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

export default function TabsLayout() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const waitingForRole = isAuthenticated && me === undefined;
  usePushRegistration({ navigationReady: !waitingForRole });

  const isCampusLeader = me?.isCampusLeader ?? false;
  const isStaff = !!me?.profile;

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

  if (waitingForRole) {
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
