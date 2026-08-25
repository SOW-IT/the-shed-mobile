import { Ionicons } from "@expo/vector-icons";
import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { ReactNode, Ref, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
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
import { FadeInView, FastModal, SowSpinner, Txt } from "./primitives";
import { styles } from "./styles";

const NEAR_BOTTOM = 600;

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
  maxWidth,
}: {
  children?: ReactNode;
  toast?: ToastState;
  scrollRef?: Ref<ScrollView>;
  footer?: ReactNode;
  title?: string;
  subtitle?: string;
  headerRight?: ReactNode;
  onBack?: () => void;
  onEndReached?: () => void;
  stickyHeaderIndices?: number[];
  maxWidth?: number;
}) => {
  const t = useAppTheme();
  const headerShown = !!(title || headerRight || onBack);
  const resolvedStickyIndices = stickyHeaderIndices?.map(
    (i) => i + (headerShown ? 1 : 0)
  );
  const lastEndReachedHeight = useRef(-1);
  const onEndReachedRef = useRef(onEndReached);
  useEffect(() => {
    onEndReachedRef.current = onEndReached;
  }, [onEndReached]);
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.background }]} edges={["top"]}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={resolvedStickyIndices}
        style={{ backgroundColor: t.background }}
        contentContainerStyle={[
          styles.scroll,
          maxWidth != null && { maxWidth },
          footer != null && { paddingBottom: 96 },
        ]}
        scrollEventThrottle={onEndReached ? 16 : undefined}
        onScroll={
          onEndReached
            ? ({ nativeEvent }) => {
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                if (contentSize.height < lastEndReachedHeight.current) {
                  lastEndReachedHeight.current = -1;
                }
                const distanceFromBottom =
                  contentSize.height - (contentOffset.y + layoutMeasurement.height);
                if (
                  distanceFromBottom < NEAR_BOTTOM &&
                  contentSize.height > lastEndReachedHeight.current
                ) {
                  lastEndReachedHeight.current = contentSize.height;
                  onEndReachedRef.current?.();
                }
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
  const me = useQuery(api.directory.me);
  const isStaff = !!me?.profile;
  const logoHref = "/home";
  const unread =
    useQuery(api.notifications.unreadCount, isStaff ? {} : "skip") ?? 0;
  const [testInfo, setTestInfo] = useState(false);
  const [signInMenu, setSignInMenu] = useState(false);
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
          accessibilityLabel="Go to Home"
        >
          <Image
            source={require("../../../assets/images/the-shed-compact-logo.png")}
            style={[styles.topBarLogo, { tintColor: t.text }]}
            resizeMode="contain"
          />
        </Pressable>
      </Animated.View>
      <View style={styles.topBarCenter} pointerEvents="box-none">
        {IS_DEV_ENVIRONMENT ? (
          <Pressable
            onPress={() => setTestInfo(true)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Test environment. What is this?"
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
          <Pressable
            onPress={() => {
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
      <FastModal
        visible={signInMenu}
        onRequestClose={() => setSignInMenu(false)}
      >
        <Pressable
          style={styles.dropdownBackdrop}
          accessibilityLabel="Close menu"
          accessible={false}
          onPress={() => {
            if (!busy) {
              setSignInMenu(false);
              clearError();
            }
          }}
        >
          <View
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
      </FastModal>
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

export const TabBar = ({
  segments,
  active,
  onChange,
  position,
}: {
  segments: Segment[];
  active: string;
  onChange: (key: string) => void;
  position?: Animated.Value;
}) => {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const activeIndex = Math.max(
    segments.findIndex((segment) => segment.key === active),
    0
  );
  const [internal] = useState(() => new Animated.Value(activeIndex));
  const pos = position ?? internal;
  useEffect(() => {
    if (position) return;
    Animated.spring(internal, {
      toValue: activeIndex,
      useNativeDriver: USE_NATIVE_DRIVER,
      speed: 18,
      bounciness: 4,
    }).start();
  }, [activeIndex, position, internal]);

  if (segments.length < 2) return null;
  const segWidth = width / segments.length;
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
