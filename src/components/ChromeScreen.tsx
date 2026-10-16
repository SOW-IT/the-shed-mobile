import { useQuery } from "convex/react";
import { ReactNode, Ref } from "react";
import { Animated, type ScrollViewInstance, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme } from "@/theme";
import { DrawerEdgeSwipe } from "@/components/nav/NavDrawer";
import { useWideLayout } from "@/components/nav/layout";
import { TopBar } from "@/components/nav/TopBar";
import { TOP_BAR_HEIGHT, useTopBarCollapse } from "@/components/useTopBarCollapse";

export const ChromeScreen = ({
  children,
  floating,
  fullWidth = false,
  scrollRef,
}: {
  children?: ReactNode;
  floating?: ReactNode;
  fullWidth?: boolean;
  scrollRef?: Ref<ScrollViewInstance>;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const insets = useSafeAreaInsets();
  const { collapseStyle, barOpacityStyle, scrollProps } = useTopBarCollapse();
  // Wide screens have the sidebar instead of a top bar.
  const wide = useWideLayout();
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        style={[styles.body, { backgroundColor: t.background }]}
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
              <TopBar photo={me?.photo ?? null} name={me?.name ?? null} />
            </Animated.View>
          </Animated.View>
        </View>
      )}
      <DrawerEdgeSwipe top={insets.top + TOP_BAR_HEIGHT} />
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
