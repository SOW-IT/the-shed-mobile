// Part of the ui design-system, split out of the former monolithic ui.tsx.
// All symbols are re-exported from ./index so call sites still import from
// "@/components/ui".

import { Children, ReactNode, useEffect, useState } from "react";
import { Animated, Easing, Image, Platform, StyleProp, Text, TextProps, View, ViewStyle } from "react-native";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing as ReanimatedEasing } from "react-native-reanimated";
import { USE_NATIVE_DRIVER, typography, useAppTheme } from "@/theme";
import { styles } from "./styles";

const ReanimatedImage = Reanimated.createAnimatedComponent(Image);

/** Text that follows the system theme. Use instead of the raw <Text>. */
export const Txt = ({ style, ...props }: TextProps) => {
  const t = useAppTheme();
  return <Text {...props} style={[typography.body, { color: t.text }, style]} />;
};

/**
 * Gentle mount animation: fade in while drifting up. Wrap list items and
 * pass a small staggered `delay` for a premium cascade.
 */
export const FadeInView = ({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(12));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]).start();
  }, [opacity, translateY, delay]);
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
};

export const Card = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) => {
  const t = useAppTheme();
  return (
    <View style={[styles.card, t.shadowCard, { backgroundColor: t.card }, style]}>
      {children}
    </View>
  );
};

/** Quiet uppercase section label, Linear-style. */
export const SectionTitle = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return (
    <Text style={[typography.label, styles.sectionTitle, { color: t.muted }]}>
      {children}
    </Text>
  );
};

export const Row = ({
  children,
  spread,
  loading,
}: {
  children: ReactNode;
  /** Gives each child an equal share of the width — e.g. Cancel | Save at 50/50. */
  spread?: boolean;
  /** Replaces the row's children with a centred SOW spinner at button height. */
  loading?: boolean;
}) => {
  if (loading) {
    return (
      <View style={styles.rowLoading}>
        <SowSpinner size={24} />
      </View>
    );
  }
  if (spread) {
    return (
      <View style={styles.rowSpread}>
        {Children.map(children, (child) => (
          <View style={{ flex: 1 }}>{child}</View>
        ))}
      </View>
    );
  }
  return <View style={styles.row}>{children}</View>;
};

export const Chip = ({ label }: { label: string }) => {
  const t = useAppTheme();
  const colors =
    label === "PAID" || label === "DECLINED" ? t.chip[label] : t.chip.default;
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <View style={[styles.chipDot, { backgroundColor: colors.fg }]} />
      <Text style={[styles.chipText, { color: colors.fg }]}>{label}</Text>
    </View>
  );
};

export const Muted = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return <Text style={[typography.caption, { color: t.muted }]}>{children}</Text>;
};

/** SOW logo that rotates continuously — used as the app's loading spinner.
 * Uses react-native-reanimated so the rotation runs on the UI thread and
 * never freezes when the JS thread is busy (e.g. during heavy renders). */
export const SowSpinner = ({ size = 64, onDark }: { size?: number; onDark?: boolean }) => {
  const t = useAppTheme();
  const dark = onDark ?? t.dark;
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: ReanimatedEasing.linear }),
      -1,
      false
    );
    return () => { cancelAnimation(rotation); };
  }, [rotation]);
  const animatedStyle = useAnimatedStyle(() => ({
    width: size,
    height: size,
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  return (
    <ReanimatedImage
      source={
        dark
          ? require("../../../assets/images/splash-icon-dark.png")
          : require("../../../assets/images/splash-icon.png")
      }
      style={animatedStyle}
      resizeMode="contain"
      accessibilityLabel="Loading"
    />
  );
};

/**
 * A soft, blurred placeholder bar shown in place of async content (a person's
 * name, a receipt file link) while it loads. The blur + gentle pulse reads as
 * "loading" without a hard skeleton, and resolves to the real value once the
 * query lands.
 */
export const LoadingBar = ({
  width = 56,
  height = 10,
}: {
  width?: number;
  height?: number;
}) => {
  const t = useAppTheme();
  const [pulse] = useState(() => new Animated.Value(0.45));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.85,
          duration: 650,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 650,
          useNativeDriver: USE_NATIVE_DRIVER,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: height / 2,
        backgroundColor: t.separator,
        opacity: pulse,
        // Native wants the object form; web (react-native-web) wants a CSS
        // string. Either way it frosts the placeholder while loading.
        filter: Platform.OS === "web" ? "blur(2px)" : [{ blur: 2 }],
      }}
    />
  );
};
