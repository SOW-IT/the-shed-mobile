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
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { useWideLayout } from "@/components/nav/layout";
import { hapticSelect, LoadingState, usePressScale } from "@/components/ui";
import { usePushRegistration } from "@/hooks/usePushRegistration";
import { useReportAppVersion } from "@/hooks/useReportAppVersion";
import { useBadgeSync } from "@/hooks/useBadgeSync";
import { useReportSeen } from "@/hooks/useReportSeen";
import { BOTTOM_TAB_HEIGHT, radius, useAppTheme } from "@/theme";

/** The current tab's icon sits on a soft pill. */
const TabPill = ({ focused, children }: { focused: boolean; children: React.ReactNode }) => {
  const t = useAppTheme();
  return (
    <View style={[styles.tabPill, focused && { backgroundColor: t.primarySoft }]}>{children}</View>
  );
};

const tabIcon =
  (outline: keyof typeof Ionicons.glyphMap, filled: keyof typeof Ionicons.glyphMap) => {
    const TabBarIcon = ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <TabPill focused={focused}>
        <Ionicons name={focused ? filled : outline} size={22} color={color as string} />
      </TabPill>
    );
    return TabBarIcon;
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

const sideMenuOnly = { tabBarItemStyle: { display: "none" as const } };

const AnimatedTabBarButton = ({
  children,
  style,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  disabled,
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
      disabled={disabled ?? undefined}
      onLongPress={onLongPress ?? undefined}
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
  usePushRegistration({ navigationReady: !waitingForRole, signedInAs: me?.email ?? null });
  useReportAppVersion();
  useReportSeen();
  useBadgeSync(me === undefined ? undefined : !!me?.profile);

  const isStaff = !!me?.profile;

  // Wide screens navigate from the sidebar; keep only the home-indicator gap.
  const wide = useWideLayout();

  if (waitingForRole) {
    return <LoadingState />;
  }

  return (
    <Tabs
      backBehavior="history"
      tabBar={wide ? () => <View style={{ height: insets.bottom }} /> : undefined}
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
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: t.border,
          height: BOTTOM_TAB_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
          elevation: 0,
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
      {/* Reimbursements opens from the side menu, not the tab bar. It stays a
          tab at "/" so notification links like "/?tab=review" keep working. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Reimbursements",
          ...sideMenuOnly,
        }}
      />
      {/* Design Requests, Event Requests and Profile also open from the side menu only. */}
      <Tabs.Screen
        name="design-requests"
        options={{ title: "Design Requests", ...sideMenuOnly }}
      />
      <Tabs.Screen
        name="event-requests"
        options={{ title: "Event Requests", ...sideMenuOnly }}
      />
      <Tabs.Screen name="profile" options={{ title: "Profile", ...sideMenuOnly }} />
      <Tabs.Screen
        name="attendance"
        options={{
          title: "Attendance",
          ...(isStaff ? {} : sideMenuOnly),
          tabBarIcon: tabIcon("checkbox-outline", "checkbox"),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: tabIcon("stats-chart-outline", "stats-chart"),
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
        name="churches"
        options={{
          title: "Churches",
          ...(isStaff ? sideMenuOnly : {}),
          tabBarIcon: tabIcon("business-outline", "business"),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          ...sideMenuOnly,
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
  tabPill: {
    width: 58,
    height: 32,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
