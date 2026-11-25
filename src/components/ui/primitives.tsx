import { Children, ReactNode, useEffect, useState } from "react";
import { Animated, Easing, Image, Modal, Platform, StyleProp, StyleSheet, Text, TextProps, TextStyle, View, ViewStyle } from "react-native";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing as ReanimatedEasing } from "react-native-reanimated";
import { USE_NATIVE_DRIVER, durations, typography, useAppTheme } from "@/theme";
import { keyed } from "@/lib/listKeys";
import { touchBoundary } from "@shared/modalTouches";
import { styles } from "./styles";

const ReanimatedImage = Reanimated.createAnimatedComponent(Image);

const WEB = Platform.OS === "web";

/**
 * A looping CSS animation for react-native-web, which turns
 * `animationKeyframes` into @keyframes. The browser runs it by itself, where
 * an Animated or Reanimated loop on web runs JavaScript every frame. It only
 * works in a StyleSheet style on a plain View or Image: Animated components
 * flatten their style inline, where keyframes can't go. Transforms are CSS
 * strings, as react-native-web drops transform arrays inside keyframes.
 */
const webLoop = (
  frames: Record<string, Record<string, string | number>>,
  ms: number,
  timing: string
): ViewStyle =>
  ({
    animationKeyframes: frames,
    animationDuration: `${ms}ms`,
    animationTimingFunction: timing,
    animationIterationCount: "infinite",
  }) as unknown as ViewStyle;

const SPIN_MS = 1200;
const PULSE_MS = 650;
const PULSE_LOW = 0.45;
const PULSE_HIGH = 0.85;

const webMotion = StyleSheet.create({
  spin: WEB ? webLoop({ "0%": { transform: "rotate(0deg)" }, "100%": { transform: "rotate(360deg)" } }, SPIN_MS, "linear") : {},
  // Up for one beat and down for the next, eased each way, as LoadingBar's
  // native sequence of two timings does.
  pulse: WEB
    ? webLoop({ "0%": { opacity: PULSE_LOW }, "50%": { opacity: PULSE_HIGH }, "100%": { opacity: PULSE_LOW } }, PULSE_MS * 2, "ease-in-out")
    : {},
});

export const Txt = ({ style, ...props }: TextProps) => {
  const t = useAppTheme();
  return <Text {...props} style={[typography.body, { color: t.text }, style]} />;
};

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
  const [translateY] = useState(() => new Animated.Value(8));
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: durations.fadeIn,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: durations.fadeIn,
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

const modalTouches = Platform.OS === "web" ? undefined : touchBoundary;

export const FastModal = ({
  visible,
  onRequestClose,
  children,
}: {
  visible: boolean;
  onRequestClose?: () => void;
  children: ReactNode;
}) => {
  const [mounted, setMounted] = useState(visible);
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  useEffect(() => {
    if (visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount the Modal, then fade in
      setMounted(true);
      Animated.timing(opacity, {
        toValue: 1,
        duration: durations.overlayIn,
        easing: Easing.out(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: durations.overlayOut,
        easing: Easing.in(Easing.quad),
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, opacity]);
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={onRequestClose}>
      <Animated.View style={{ flex: 1, opacity }} {...modalTouches}>
        {children}
      </Animated.View>
    </Modal>
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
    <View style={[styles.card, t.surfaceEdge, { backgroundColor: t.card }, style]}>
      {children}
    </View>
  );
};

export const Chip = ({ children }: { children: string | number }) => {
  const t = useAppTheme();
  return (
    <View style={[styles.chip, { backgroundColor: t.ghost }]}>
      <Text numberOfLines={1} style={[styles.chipText, { color: t.muted }]}>
        {children}
      </Text>
    </View>
  );
};

export const SectionTitle = ({
  children,
  chip,
}: {
  children: ReactNode;
  chip?: string | number;
}) => {
  const t = useAppTheme();
  const title = (
    <Text
      accessibilityRole="header"
      style={[
        typography.section,
        chip === undefined ? styles.sectionTitle : styles.sectionTitleText,
        { color: t.text },
      ]}
    >
      {children}
    </Text>
  );
  if (chip === undefined) return title;
  return (
    <View style={[styles.sectionTitle, styles.inlineRow]}>
      {title}
      <Chip>{chip}</Chip>
    </View>
  );
};

export const Facts = ({
  parts,
  style,
  numberOfLines,
}: {
  parts: (string | number | null | undefined | false)[];
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) => {
  const t = useAppTheme();
  const shown = parts.filter((part): part is string | number => part !== null && part !== undefined && part !== false && part !== "");
  if (shown.length === 0) return null;
  return (
    <View style={styles.facts}>
      {keyed(shown, String).map(({ item: part, key }) => (
        <Text
          key={key}
          numberOfLines={numberOfLines}
          style={[typography.caption, { color: t.muted }, style, styles.fact]}
        >
          {part}
        </Text>
      ))}
    </View>
  );
};

export const Row = ({
  children,
  spread,
  loading,
}: {
  children: ReactNode;
  spread?: boolean;
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
      <View style={styles.inlineRow}>
        {Children.map(children, (child) => (
          <View style={{ flex: 1 }}>{child}</View>
        ))}
      </View>
    );
  }
  return <View style={styles.row}>{children}</View>;
};

export const Muted = ({ children }: { children: ReactNode }) => {
  const t = useAppTheme();
  return <Text style={[typography.caption, { color: t.muted }]}>{children}</Text>;
};

export const Answer = ({ label, children }: { label: string; children: ReactNode }) => {
  const t = useAppTheme();
  return (
    <View style={styles.answer}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <Text selectable style={[typography.body, { color: t.text }]}>
        {children}
      </Text>
    </View>
  );
};

type SpinnerProps = { size?: number; onDark?: boolean };

// 256 px copies of the splash marks: the spinner is at most 64 pt, and
// the 1024 px originals cost about 4 MB of decoded bitmap each.
const spinnerImage = (dark: boolean) =>
  dark ? require("../../../assets/images/spinner-dark.png") : require("../../../assets/images/spinner.png");

/** On web the turn is a CSS animation, so a spinner left on screen costs no JavaScript. */
const WebSpinner = ({ size = 64, onDark }: SpinnerProps) => {
  const t = useAppTheme();
  return (
    <View style={[{ width: size, height: size }, webMotion.spin]} accessibilityLabel="Loading">
      <Image source={spinnerImage(onDark ?? t.dark)} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
};

const NativeSpinner = ({ size = 64, onDark }: SpinnerProps) => {
  const t = useAppTheme();
  const dark = onDark ?? t.dark;
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: ReanimatedEasing.linear }),
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
      source={spinnerImage(dark)}
      style={animatedStyle}
      resizeMode="contain"
      accessibilityLabel="Loading"
    />
  );
};

export const SowSpinner = WEB ? WebSpinner : NativeSpinner;

type LoadingBarProps = { width?: number; height?: number };

/** On web the pulse is a CSS animation, so skeletons on screen cost no JavaScript. */
const WebLoadingBar = ({ width = 56, height = 10 }: LoadingBarProps) => {
  const t = useAppTheme();
  return (
    <View
      style={[
        { width, height, borderRadius: height / 2, backgroundColor: t.separator, filter: "blur(2px)" },
        webMotion.pulse,
      ]}
    />
  );
};

const NativeLoadingBar = ({ width = 56, height = 10 }: LoadingBarProps) => {
  const t = useAppTheme();
  const [pulse] = useState(() => new Animated.Value(PULSE_LOW));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: PULSE_HIGH,
          duration: PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: PULSE_LOW,
          duration: PULSE_MS,
          useNativeDriver: true,
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
        filter: [{ blur: 2 }],
      }}
    />
  );
};

export const LoadingBar = WEB ? WebLoadingBar : NativeLoadingBar;
