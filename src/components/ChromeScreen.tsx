import { useQuery } from "convex/react";
import { ReactNode, Ref, useRef } from "react";
import { Animated, Pressable, type ScrollViewInstance, StyleSheet, Text, View, type ViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../../convex/_generated/api";
import { spacing, typography, useAppTheme } from "@/theme";
import { DrawerEdgeSwipe } from "@/components/nav/NavDrawer";
import { useWideLayout } from "@/components/nav/layout";
import { TopBar } from "@/components/nav/TopBar";
import { TOP_BAR_HEIGHT, useTopBarCollapse } from "@/components/useTopBarCollapse";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";

export const ChromeScreen = ({
  children,
  floating,
  fullWidth = false,
  scrollRef,
  title,
  onBack,
}: {
  children?: ReactNode;
  floating?: ReactNode;
  fullWidth?: boolean;
  scrollRef?: Ref<ScrollViewInstance>;
  // In the top bar; a wide screen has no top bar, so the screen shows it itself.
  title?: ReactNode;
  onBack?: () => void;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const insets = useSafeAreaInsets();
  const frameRef = useRef<ViewInstance>(null);
  const keyboardInset = useKeyboardInset(frameRef, false);
  const { collapseStyle, barOpacityStyle, scrollProps } = useTopBarCollapse();
  const wide = useWideLayout();
  return (
    <View ref={frameRef} style={[styles.screen, { backgroundColor: t.background }]}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        style={[styles.body, { backgroundColor: t.background, marginBottom: keyboardInset }]}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: wide
              ? spacing.lg + insets.top
              : spacing.xs + TOP_BAR_HEIGHT + insets.top,
          },
          fullWidth && wide && { maxWidth: "100%" as const },
        ]}
        {...scrollProps}
      >
        {wide && onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID="top-bar-back"
            style={({ pressed }) => [styles.wideBack, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="chevron-back" size={20} color={t.text} />
            <Text style={[typography.label, { color: t.text }]}>Back</Text>
          </Pressable>
        ) : null}
        {children}
      </Animated.ScrollView>
      {wide ? null : (
        <View
          style={[styles.topBarClip, { height: TOP_BAR_HEIGHT + insets.top }]}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.topBarWrap,
              { backgroundColor: t.background, paddingTop: insets.top },
              collapseStyle,
            ]}
          >
            <Animated.View style={barOpacityStyle}>
              <TopBar photo={me?.photo ?? null} name={me?.name ?? null} title={title} onBack={onBack} />
            </Animated.View>
          </Animated.View>
        </View>
      )}
      {onBack ? null : <DrawerEdgeSwipe top={insets.top + TOP_BAR_HEIGHT} />}
      {floating}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  topBarClip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: TOP_BAR_HEIGHT,
    overflow: "hidden",
    zIndex: 10,
  },
  topBarWrap: {
    width: "100%",
    paddingHorizontal: spacing.lg,
  },
  wideBack: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: 48,
    gap: spacing.md,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
});
