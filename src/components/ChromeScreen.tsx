import { useQuery } from "convex/react";
import { ReactNode } from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "../../convex/_generated/api";
import { spacing, useAppTheme, WIDE_SCREEN_MIN_WIDTH } from "@/theme";
import { TopBar } from "@/components/ui";
import { TOP_BAR_HEIGHT, useTopBarCollapse } from "@/components/useTopBarCollapse";

export const ChromeScreen = ({
  children,
  footer,
  floating,
  fullWidth = false,
}: {
  children?: ReactNode;
  footer?: ReactNode;
  floating?: ReactNode;
  fullWidth?: boolean;
}) => {
  const t = useAppTheme();
  const me = useQuery(api.directory.me);
  const insets = useSafeAreaInsets();
  const { collapseStyle, barOpacityStyle, scrollProps } = useTopBarCollapse();
  const wide = useWindowDimensions().width >= WIDE_SCREEN_MIN_WIDTH;
  return (
    <View style={[styles.screen, { backgroundColor: t.background }]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        style={[styles.body, { backgroundColor: t.background }]}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: spacing.xs + TOP_BAR_HEIGHT + insets.top },
          fullWidth && wide && { maxWidth: "100%" as const },
        ]}
        {...scrollProps}
      >
        {children}
      </Animated.ScrollView>
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
      {footer}
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
