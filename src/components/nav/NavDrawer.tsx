import { useConvexAuth } from "convex/react";
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavMenu } from "@/components/nav/NavMenu";
import { useWideLayout } from "@/components/nav/layout";
import { spacing, useAppTheme } from "@/theme";

const DRAWER_WIDTH_FRACTION = 0.8;
const DRAWER_MAX_WIDTH = 320;
const EDGE_SWIPE_WIDTH = 20;
const BACKDROP_OPACITY = 0.45;
const FLING_VELOCITY = 500;
const OPEN_TIMING = { duration: 260, easing: Easing.out(Easing.cubic) };
const CLOSE_TIMING = { duration: 220, easing: Easing.out(Easing.cubic) };

type NavDrawerContextValue = {
  progress: SharedValue<number>;
  width: number;
  shown: boolean;
  show: () => void;
  hide: () => void;
  open: () => void;
  close: () => void;
};

const noop = () => {};

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export const useNavDrawer = () => {
  const value = useContext(NavDrawerContext);
  return value ?? { open: noop, close: noop };
};

const useDrawerState = () => {
  const value = useContext(NavDrawerContext);
  if (!value) throw new Error("The drawer needs a NavDrawerProvider above it");
  return value;
};

const clamp01 = (value: number) => {
  "worklet";
  return Math.min(Math.max(value, 0), 1);
};

const settle = (progress: SharedValue<number>, velocityX: number, onClosed: () => void) => {
  "worklet";
  const opening =
    velocityX > FLING_VELOCITY || (velocityX > -FLING_VELOCITY && progress.value > 0.5);
  progress.value = withTiming(opening ? 1 : 0, opening ? OPEN_TIMING : CLOSE_TIMING, (finished) => {
    if (finished && !opening) runOnJS(onClosed)();
  });
};

export const NavDrawerProvider = ({ children }: { children: ReactNode }) => {
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(Math.round(windowWidth * DRAWER_WIDTH_FRACTION), DRAWER_MAX_WIDTH);
  const wide = useWideLayout();
  const { isAuthenticated } = useConvexAuth();
  const progress = useSharedValue(0);
  const [shown, setShown] = useState(false);
  const show = useCallback(() => setShown(true), []);
  const hide = useCallback(() => setShown(false), []);
  /* eslint-disable react-hooks/immutability -- Reanimated shared values are
     written through `.value`; the React Compiler rule doesn't model them. */
  const open = useCallback(() => {
    setShown(true);
    progress.value = withTiming(1, OPEN_TIMING);
  }, [progress]);
  const close = useCallback(() => {
    progress.value = withTiming(0, CLOSE_TIMING, (finished) => {
      if (finished) runOnJS(hide)();
    });
  }, [progress, hide]);
  useEffect(() => {
    if (isAuthenticated && !wide) return;
    progress.value = 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset on sign-out / layout change
    setShown(false);
  }, [isAuthenticated, wide, progress]);
  /* eslint-enable react-hooks/immutability */
  const value = useMemo(
    () => ({ progress, width, shown, show, hide, open, close }),
    [progress, width, shown, show, hide, open, close]
  );
  return <NavDrawerContext.Provider value={value}>{children}</NavDrawerContext.Provider>;
};

export const DrawerEdgeSwipe = ({ top }: { top: number }) => {
  const { progress, width, show, hide } = useDrawerState();
  const { isAuthenticated } = useConvexAuth();
  const wide = useWideLayout();
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(10)
        .failOffsetY([-15, 15])
        .onStart(() => {
          runOnJS(show)();
        })
        .onUpdate((e) => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value
          progress.value = clamp01(e.translationX / width);
        })
        .onEnd((e) => {
          settle(progress, e.velocityX, hide);
        }),
    [progress, width, show, hide]
  );
  if (Platform.OS === "web" || wide || !isAuthenticated) return null;
  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.edge, { top }]} />
    </GestureDetector>
  );
};

export const AppDrawer = () => {
  const { shown } = useDrawerState();
  return shown ? <DrawerOverlay /> : null;
};

const DrawerOverlay = () => {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const { progress, width, hide, close } = useDrawerState();

  useEffect(() => {
    if (Platform.OS === "android") {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        close();
        return true;
      });
      return () => sub.remove();
    }
    if (Platform.OS === "web") {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
  }, [close]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-15, 15])
        .onUpdate((e) => {
          // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value
          progress.value = clamp01(1 + e.translationX / width);
        })
        .onEnd((e) => {
          settle(progress, e.velocityX, hide);
        }),
    [progress, width, hide]
  );
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value * BACKDROP_OPACITY,
  }));
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value - 1) * width }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={pan}>
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            />
          </Animated.View>
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.panel,
              { width, backgroundColor: t.background },
              panelStyle,
            ]}
          >
            <NavMenu
              variant="drawer"
              onNavigate={close}
              paddingTop={insets.top + spacing.lg}
              paddingBottom={insets.bottom + spacing.lg}
            />
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "#000000" },
  panel: { position: "absolute", top: 0, bottom: 0, left: 0 },
  edge: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: EDGE_SWIPE_WIDTH,
    zIndex: 30,
  },
});
