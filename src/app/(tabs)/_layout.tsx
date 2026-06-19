import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { Tabs } from "expo-router";
import { ColorValue, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../../convex/_generated/api";
import { hapticSelect } from "@/components/ui";
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
          paddingBottom: Math.max(insets.bottom, 4),
          paddingTop: 4,
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
        name="admin"
        options={{
          title: "Admin",
          // Admins get the full Manage screen; the Finance Head gets a
          // restricted view (Budget Manager only).
          href: me?.isAdmin || me?.isFinanceHead ? "/admin" : null,
          tabBarIcon: tabIcon("settings-outline", "settings"),
        }}
      />
    </Tabs>
  );
}
