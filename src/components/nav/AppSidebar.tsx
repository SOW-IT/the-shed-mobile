import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavMenu } from "@/components/nav/NavMenu";
import { SIDEBAR_WIDTH } from "@/components/nav/layout";
import { spacing, useAppTheme } from "@/theme";

/**
 * Wide screens' permanent left sidebar. It stands in for the top bar and the
 * bottom tabs, and stays beside every screen, including ones opened on top.
 */
export const AppSidebar = () => {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.sidebar,
        {
          backgroundColor: t.background,
          borderRightColor: t.separator,
          paddingTop: insets.top + spacing.lg,
          paddingBottom: insets.bottom + spacing.lg,
          paddingLeft: insets.left,
        },
      ]}
    >
      <NavMenu variant="sidebar" />
    </View>
  );
};

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
});
