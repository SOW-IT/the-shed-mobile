import type { ReactNode } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Whether the main pointer is a finger (a phone or tablet browser). */
const touchScreen = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

/**
 * Whether a sideways game is drawn turned a quarter turn, and the safe area
 * in the game's own directions when it is. The app is portrait-only and has
 * no orientation library (adding one is a native change), so on a phone held
 * upright the game is drawn turned: hold the phone sideways. A desktop
 * browser window that happens to be tall keeps the wide board.
 */
export const useSideways = () => {
  const screen = useWindowDimensions();
  const safe = useSafeAreaInsets();
  const turned = screen.height > screen.width && (Platform.OS !== "web" || touchScreen());
  // Turned a quarter turn clockwise: the notch is on the game's left.
  const insets = turned ? { top: safe.right, right: safe.bottom, bottom: safe.left, left: safe.top } : undefined;
  return { turned, insets, screen };
};

/** The game's screen, turned a quarter turn when `turned`. */
export const Sideways = ({
  turned,
  background,
  children,
}: {
  turned: boolean;
  background: string;
  children: ReactNode;
}) => {
  const screen = useWindowDimensions();
  if (!turned) return children;
  return (
    <View style={[styles.fill, { backgroundColor: background }]}>
      {/* Turned about its top-left corner, not its middle: with an odd screen
          width the middle sits on half a point, which puts everything drawn
          inside half a pixel off the grid and blurs it (the cards most). */}
      <View
        style={{
          position: "absolute",
          width: screen.height,
          height: screen.width,
          left: screen.width,
          top: 0,
          transformOrigin: "top left",
          transform: [{ rotate: "90deg" }],
        }}
      >
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
});
