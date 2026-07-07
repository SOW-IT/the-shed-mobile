// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import { Ionicons } from "@expo/vector-icons";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { ReactNode, Ref, useEffect, useState } from "react";
import {
  Alert,
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
import {
  type GoogleProvider,
  type SignInOutcome,
  useGoogleSignIn,
} from "@/hooks/useGoogleSignIn";
import {
  useAppleSignIn,
  useAppleSignInAvailable,
} from "@/hooks/useAppleSignIn";
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
 * Top chrome for the main screens: the SOW logo (taps → Home) on the left
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
  // Notifications are a staff surface — gated on a provisioned staff profile,
  // the same check the tabs use, not merely being signed in.
  const me = useQuery(api.directory.me);
  const isStaff = !!me?.profile;
  // The logo takes staff back to their workspace (as it always has, via the
  // Home redirect), but visitors and signed-in accounts without a staff profile
  // land on the public Home tab (1.7.4) — the Home surface is theirs now.
  const logoHref = isStaff ? (me?.isCampusLeader ? "/attendance" : "/") : "/home";
  const unread =
    useQuery(api.notifications.unreadCount, isStaff ? {} : "skip") ?? 0;
  const [testInfo, setTestInfo] = useState(false);
  // Signed-out avatar dropdown (Sign in with Google). Rendered as a Modal —
  // the top bar lives inside an overflow-hidden collapsing clip, so anything
  // anchored inside it would be cut off at the bar's edge.
  const [signInMenu, setSignInMenu] = useState(false);
  // Three sign-in flows: the org-restricted staff Google account, any personal
  // (non-staff) Google account (1.7.4), and Sign in with Apple (1.8.0) — the
  // Guideline 4.8 equivalent login, offered on iOS where the OS supports it.
  const sow = useGoogleSignIn("google");
  const personal = useGoogleSignIn("googlePersonal");
  const apple = useAppleSignIn();
  const appleAvailable = useAppleSignInAvailable();
  const busy = sow.busy || personal.busy || apple.busy;
  const error = sow.error ?? personal.error ?? apple.error;
  const clearError = () => {
    sow.clearError();
    personal.clearError();
    apple.clearError();
  };
  const signInAndClose = async (
    signIn: () => Promise<SignInOutcome>,
    kind: GoogleProvider | "apple"
  ) => {
    setSignInMenu(false);
    clearError();
    const outcome = await signIn();
    // The provider authenticated the account but our backend refused it (for the
    // Google flows the OAuth callback returns with no code; for Apple the server
    // throws a tagged error). Without this the attempt would quietly do nothing —
    // tell the user why and where to go instead.
    if (outcome === "rejected") {
      if (kind === "googlePersonal" || kind === "apple") {
        Alert.alert(
          "Use your SOW account",
          "That looks like a SOW organisation account. Please tap “Sign in with your SOW account” to sign in with it.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "SOW account required",
          "Only SOW organisation accounts can sign in here. To browse as a guest, tap “Sign in with Google” instead.",
          [{ text: "OK" }]
        );
      }
    } else if (outcome === "error") {
      // An unexpected failure (e.g. Apple token verification, a JWKS/network
      // error). The per-hook error message renders inside the menu, but we've
      // just closed it — so surface a prompt here or the attempt looks like it
      // silently did nothing. (A cancel stays quiet, as before.)
      Alert.alert(
        "Sign-in failed",
        "Something went wrong signing you in. Please try again.",
        [{ text: "OK" }]
      );
    }
  };
  return (
    <View style={styles.topBar}>
      <Animated.View style={{ transform: [{ scale: home.scale }] }}>
        <Pressable
          onPress={() => router.push(logoHref)}
          onPressIn={home.onPressIn}
          onPressOut={home.onPressOut}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isStaff ? "Go to your workspace" : "Go to Home"}
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
        {/* Notifications are a staff concern — hidden for visitors and
            signed-in non-staff accounts. */}
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
                <View style={[styles.topBarBadge, { backgroundColor: t.accent }]}>
                  <Text style={styles.topBarBadgeText}>
                    {unread > 99 ? "99+" : unread}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </Animated.View>
        ) : null}
        {isAuthenticated ? (
          <Animated.View style={{ transform: [{ scale: profile.scale }] }}>
            <Pressable
              onPress={() => router.push("/profile")}
              onPressIn={profile.onPressIn}
              onPressOut={profile.onPressOut}
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
            >
              <Avatar photo={photo} name={name} size={40} />
            </Pressable>
          </Animated.View>
        ) : (
          // Visitors get a clear, wider call-to-action instead of an empty avatar.
          <Pressable
            onPress={() => {
              // Clear any error left over from a previous failed attempt so a
              // stale message doesn't reappear when the menu reopens.
              clearError();
              setSignInMenu(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
            style={({ pressed }) => [
              styles.signInButton,
              { backgroundColor: t.primary },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="log-in-outline" size={16} color={t.onPrimary} />
            <Text
              style={[typography.caption, { color: t.onPrimary, fontWeight: "800" }]}
            >
              Sign in
            </Text>
          </Pressable>
        )}
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
          // Without this, the backdrop's own accessibilityLabel makes it a
          // single opaque accessibility element that swallows everything
          // nested inside — including the actual "Sign in with your SOW
          // account" button, which sits inside this same Pressable as its
          // child. That made the sign-in action unreachable to VoiceOver
          // (and to any accessibility-tree-based automation), not just
          // visually tappable. Letting children report individually is the
          // fix; the backdrop's own tap-to-dismiss still works for touch.
          accessible={false}
          onPress={() => {
            if (!busy) {
              setSignInMenu(false);
              clearError();
            }
          }}
        >
          <View
            // The backdrop is `accessible={false}` (so the sign-in button is
            // reachable), which drops its "Close menu" action from the a11y
            // tree. Scope VoiceOver focus to the menu and expose a discoverable
            // dismiss via the native escape gesture (two-finger scrub) so
            // closing stays reachable without a visible close button.
            accessibilityViewIsModal
            accessibilityActions={[{ name: "escape", label: "Close menu" }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "escape" && !busy) {
                setSignInMenu(false);
                clearError();
              }
            }}
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
              onPress={() => void signInAndClose(sow.signInWithGoogle, "google")}
              accessibilityRole="button"
              accessibilityLabel="Sign in with your SOW account"
              style={({ pressed }) => [
                styles.dropdownItem,
                pressed && { opacity: 0.6 },
              ]}
            >
              {sow.busy ? (
                <SowSpinner size={18} onDark={t.dark} />
              ) : (
                <Ionicons name="logo-google" size={18} color={t.text} />
              )}
              <Text style={[typography.headline, { color: t.text }]}>
                Sign in with your SOW account
              </Text>
            </Pressable>
            <View
              style={[styles.dropdownDivider, { backgroundColor: t.separator }]}
            />
            <Pressable
              disabled={busy}
              onPress={() =>
                void signInAndClose(personal.signInWithGoogle, "googlePersonal")
              }
              accessibilityRole="button"
              accessibilityLabel="Sign in with a personal Google account"
              style={({ pressed }) => [
                styles.dropdownItem,
                pressed && { opacity: 0.6 },
              ]}
            >
              {personal.busy ? (
                <SowSpinner size={18} onDark={t.dark} />
              ) : (
                <Ionicons name="logo-google" size={18} color={t.text} />
              )}
              <Text style={[typography.headline, { color: t.text }]}>
                Sign in with Google
              </Text>
            </Pressable>
            {/* Sign in with Apple (iOS only, where the OS supports it) — the
                Guideline 4.8 equivalent login. Rendered as a matching list row
                (not AppleAuthenticationButton) so it sits at equal prominence
                with the Google options; the label + Apple logo satisfy Apple's
                branding rules. */}
            {appleAvailable ? (
              <>
                <View
                  style={[
                    styles.dropdownDivider,
                    { backgroundColor: t.separator },
                  ]}
                />
                <Pressable
                  disabled={busy}
                  onPress={() =>
                    void signInAndClose(apple.signInWithApple, "apple")
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with Apple"
                  style={({ pressed }) => [
                    styles.dropdownItem,
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  {apple.busy ? (
                    <SowSpinner size={18} onDark={t.dark} />
                  ) : (
                    <Ionicons name="logo-apple" size={18} color={t.text} />
                  )}
                  <Text style={[typography.headline, { color: t.text }]}>
                    Sign in with Apple
                  </Text>
                </Pressable>
              </>
            ) : null}
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
              The live app lives at theshed.sow.org.au.
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
