// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import { Ionicons } from "@expo/vector-icons";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { ReactNode, Ref, useEffect, useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { USE_NATIVE_DRIVER, spacing, typography, useAppTheme } from "@/theme";
import { IS_DEV_ENVIRONMENT } from "@/env";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { TOP_BAR_HEIGHT } from "@/components/useTopBarCollapse";
import { Avatar, Toast, ToastState } from "./feedback";
import { usePressScale } from "./format";
import { Segment } from "./forms";
import { Sheet } from "./overlays";
import { FadeInView, SowSpinner, Txt } from "./primitives";
import { styles } from "./styles";

export const Screen = ({
  children,
  toast,
  scrollRef,
  footer,
  title,
  subtitle,
  headerRight,
  onBack,
  onEndReached,
  stickyHeaderIndices,
}: {
  children?: ReactNode;
  toast?: ToastState;
  /** Exposes the screen's ScrollView, e.g. to scroll back to the top. */
  scrollRef?: Ref<ScrollView>;
  /** Pinned full-width area between the scroll content and the tab bar. */
  footer?: ReactNode;
  /** Large display title rendered at the top of the scroll content. */
  title?: string;
  /** Quiet line above the title — greeting, date, context. */
  subtitle?: string;
  /** Rendered to the right of the title (e.g. an avatar or a year picker). */
  headerRight?: ReactNode;
  /** When set, shows a back chevron to the left of the title. */
  onBack?: () => void;
  /** Fired while the user scrolls within ~600px of the bottom (infinite load). */
  onEndReached?: () => void;
  /**
   * Indices (into `children`) of elements that should pin to the top while the
   * rest scrolls under them — e.g. a search bar. The built-in header (when a
   * title/headerRight/onBack is set) is accounted for automatically.
   */
  stickyHeaderIndices?: number[];
}) => {
  const t = useAppTheme();
  const headerShown = !!(title || headerRight || onBack);
  const resolvedStickyIndices = stickyHeaderIndices?.map(
    (i) => i + (headerShown ? 1 : 0)
  );
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={resolvedStickyIndices}
        style={{ backgroundColor: t.background }}
        contentContainerStyle={[styles.scroll, footer != null && { paddingBottom: 96 }]}
        scrollEventThrottle={onEndReached ? 16 : undefined}
        onScroll={
          onEndReached
            ? ({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                const distanceFromBottom =
                  contentSize.height - (contentOffset.y + layoutMeasurement.height);
                if (distanceFromBottom < 600) onEndReached();
              }
            : undefined
        }
      >
        {(title || headerRight || onBack) && (
          <FadeInView>
            <View style={styles.header}>
              {onBack ? (
                <Pressable
                  onPress={onBack}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                  style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
                >
                  <Ionicons name="chevron-back" size={26} color={t.text} />
                </Pressable>
              ) : null}
              <View style={styles.headerText}>
                {subtitle ? (
                  <Text style={[typography.caption, { color: t.muted, marginBottom: 2 }]}>
                    {subtitle}
                  </Text>
                ) : null}
                {title ? (
                  <Text style={[typography.largeTitle, { color: t.text }]}>{title}</Text>
                ) : null}
              </View>
              {headerRight}
            </View>
          </FadeInView>
        )}
        {children}
      </ScrollView>
      {footer}
      <Toast toast={toast ?? null} />
    </SafeAreaView>
  );
};

/**
 * Top chrome for the main screens: the SOW logo (taps → Requests) on the left
 * and the profile avatar (taps → Profile) on the right. Replaces the per-screen
 * page titles. The logo art is a black wordmark, tinted to the theme text colour
 * so it reads on both the cream and deep-green backgrounds.
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
  const home = usePressScale();
  const bell = usePressScale();
  const profile = usePressScale();
  const { isAuthenticated } = useConvexAuth();
  const unread =
    useQuery(api.notifications.unreadCount, isAuthenticated ? {} : "skip") ?? 0;
  const [testInfo, setTestInfo] = useState(false);
  // Signed-out avatar dropdown (Sign in with Google). Rendered as a Modal —
  // the top bar lives inside an overflow-hidden collapsing clip, so anything
  // anchored inside it would be cut off at the bar's edge.
  const [signInMenu, setSignInMenu] = useState(false);
  const { signInWithGoogle, busy, error, clearError } = useGoogleSignIn();
  return (
    <View style={styles.topBar}>
      <Animated.View style={{ transform: [{ scale: home.scale }] }}>
        <Pressable
          onPress={() => router.push("/")}
          onPressIn={home.onPressIn}
          onPressOut={home.onPressOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go to Requests"
        >
          <Image
            source={require("../../../assets/images/the-shed-compact-logo.png")}
            style={[styles.topBarLogo, { tintColor: t.text }]}
            resizeMode="contain"
          />
        </Pressable>
      </Animated.View>
      {/* On the dev / staging build, a centred warning chip makes it obvious
          this isn't production; tapping it explains what the environment is. */}
      <View style={styles.topBarCenter} pointerEvents="box-none">
        {IS_DEV_ENVIRONMENT ? (
          <Pressable
            onPress={() => setTestInfo(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Test environment — what is this?"
            style={({ pressed }) => [
              styles.testChip,
              { backgroundColor: t.warning },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons name="construct" size={12} color="#ffffff" />
            <Text style={styles.testChipText}>Test Environment</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.topBarRight}>
        {/* Notifications are a signed-in concern — hidden for visitors. */}
        {isAuthenticated ? (
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
                <View style={[styles.topBarBadge, { backgroundColor: t.accent }]}>
                  <Text style={styles.topBarBadgeText}>
                    {unread > 99 ? "99+" : unread}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ) : null}
        <Animated.View style={{ transform: [{ scale: profile.scale }] }}>
          <Pressable
            onPress={() =>
              isAuthenticated ? router.push("/profile") : setSignInMenu(true)
            }
            onPressIn={profile.onPressIn}
            onPressOut={profile.onPressOut}
            accessibilityRole="button"
            accessibilityLabel={
              isAuthenticated ? "Open your profile" : "Sign in"
            }
          >
            <Avatar photo={photo} name={name} size={40} />
          </Pressable>
        </Animated.View>
      </View>
      {/* Signed-out avatar dropdown: a small menu anchored under the avatar. */}
      <Modal
        visible={signInMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setSignInMenu(false)}
      >
        <Pressable
          style={styles.dropdownBackdrop}
          accessibilityLabel="Close menu"
          onPress={() => {
            if (!busy) {
              setSignInMenu(false);
              clearError();
            }
          }}
        >
          <View
            style={[
              styles.dropdownMenu,
              t.shadowFloat,
              {
                backgroundColor: t.card,
                top: insets.top + TOP_BAR_HEIGHT,
              },
            ]}
          >
            <Pressable
              disabled={busy}
              onPress={() => void signInWithGoogle()}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
              style={({ pressed }) => [
                styles.dropdownItem,
                pressed && { opacity: 0.6 },
              ]}
            >
              {busy ? (
                <SowSpinner size={18} onDark={t.dark} />
              ) : (
                <Ionicons name="logo-google" size={18} color={t.text} />
              )}
              <Text style={[typography.headline, { color: t.text }]}>
                Sign in with Google
              </Text>
            </Pressable>
            {error ? (
              <Text
                style={[
                  typography.caption,
                  styles.dropdownError,
                  { color: t.errorText },
                ]}
              >
                {error}
              </Text>
            ) : null}
          </View>
        </Pressable>
      </Modal>
      {IS_DEV_ENVIRONMENT ? (
        <Sheet
          visible={testInfo}
          onClose={() => setTestInfo(false)}
          title="Development Environment"
        >
          <View style={{ gap: spacing.sm }}>
            <Txt>
              You&apos;re using the development (test) version of THE SHED, kept
              separate from the live app for trying things out.
            </Txt>
            <Txt style={{ color: t.muted }}>
              It runs against its own test database, so anything you create,
              edit, or delete here won&apos;t affect the live app or real staff
              data.
            </Txt>
            <Txt style={{ color: t.muted }}>
              The live app lives at the-shed-web.vercel.app.
            </Txt>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
};

/**
 * Full-width, square, top-pinned tab switcher: equal-width tabs with an
 * underline under the active one (no rounded pill). Carries the same action /
 * unread badges as {@link Segmented}. Hidden when there are fewer than 2 tabs.
 */
export const TabBar = ({
  segments,
  active,
  onChange,
  position,
}: {
  segments: Segment[];
  active: string;
  onChange: (key: string) => void;
  /**
   * Fractional page position (0 = first tab, 1 = second, …). When supplied —
   * e.g. driven by the pager's scroll on native — the selected-tab underline
   * tracks it continuously. Without it, the underline springs to the active
   * tab on change (the tab-to-tab animation used on web).
   */
  position?: Animated.Value;
}) => {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const activeIndex = Math.max(
    segments.findIndex((segment) => segment.key === active),
    0
  );
  // Fallback driver when no external position is passed (web / tab taps).
  const [internal] = useState(() => new Animated.Value(activeIndex));
  const pos = position ?? internal;
  useEffect(() => {
    if (position) return; // externally driven — don't fight it
    Animated.spring(internal, {
      toValue: activeIndex,
      useNativeDriver: USE_NATIVE_DRIVER,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [activeIndex, position, internal]);

  if (segments.length < 2) return null;
  const segWidth = width / segments.length;
  // position 0→1 moves the underline exactly one segment over; linear
  // extrapolation covers any number of segments.
  const translateX = pos.interpolate({
    inputRange: [0, 1],
    outputRange: [0, segWidth],
  });
  return (
    <View
      style={[styles.tabBar, { borderBottomColor: t.separator }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {segments.map((segment) => {
        const selected = segment.key === active;
        return (
          <Pressable
            key={segment.key}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.key)}
          >
            <View style={styles.tabLabelRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  { color: selected ? t.text : t.muted },
                  selected && { fontWeight: "700" },
                ]}
              >
                {segment.label}
              </Text>
              {segment.badge ? (
                <View style={[styles.tabBadge, { backgroundColor: t.warning }]}>
                  <Text style={styles.tabBadgeText}>{segment.badge}</Text>
                </View>
              ) : null}
              {segment.messageBadge ? (
                <View
                  style={[
                    styles.tabBadge,
                    { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#cccccc" },
                  ]}
                >
                  <Text style={[styles.tabBadgeText, { color: "#333333" }]}>
                    {segment.messageBadge}
                  </Text>
                </View>
              ) : null}
            </View>
            {/* Transparent spacer: reserves the underline's height so the bar
                doesn't change size when the real (absolute) indicator slides. */}
            <View style={styles.tabIndicator} />
          </Pressable>
        );
      })}
      {width > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.tabIndicatorBar,
            { width: segWidth, backgroundColor: t.primary, transform: [{ translateX }] },
          ]}
        />
      ) : null}
    </View>
  );
};
