import { Children, ReactNode, useEffect, useState } from "react";
import { Animated, Easing, Image, Modal, Platform, StyleProp, Text, TextProps, View, ViewStyle } from "react-native";
import Reanimated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing as ReanimatedEasing } from "react-native-reanimated";
import { USE_NATIVE_DRIVER, durations, typography, useAppTheme } from "@/theme";
import { styles } from "./styles";

const ReanimatedImage = Reanimated.createAnimatedComponent(Image);

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
      <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>
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
    <View style={[styles.card, t.shadowCard, { backgroundColor: t.card }, style]}>
      {children}
    </View>
  );
};

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
        filter: Platform.OS === "web" ? "blur(2px)" : [{ blur: 2 }],
      }}
    />
  );
};
