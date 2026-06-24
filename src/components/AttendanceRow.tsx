import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Avatar } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

/**
 * A single roll-call row with a native, gesture-driven swipe — the React Native
 * analogue of time-to-rollcall's GSAP draggable cards.
 *
 *  - mode "suggested": a person not yet signed in. Swipe RIGHT (green) to sign
 *    them in. The row flings off to the right and `onAction` fires.
 *  - mode "signedIn": a person already present. Swipe LEFT (red) to sign them
 *    out. The row flings off to the left and `onAction` fires.
 *
 * A partial swipe that doesn't cross the threshold springs back. The coloured
 * action layer behind the card fades in as you drag, so the gesture reads. A
 * plain tap also commits, as a pointer-friendly fallback on web.
 */

const SWIPE_THRESHOLD = 0.32; // fraction of row width to commit
const VELOCITY_COMMIT = 900; // px/s fling that commits regardless of distance

export type AttendanceRowMode = "suggested" | "signedIn";

export interface AttendanceRowProps {
  name: string;
  subtitle?: string;
  photo?: string | null;
  mode: AttendanceRowMode;
  /** Fired once the swipe (or tap) commits — sign in / sign out. */
  onAction: () => void;
}

function AttendanceRowBase({
  name,
  subtitle,
  photo,
  mode,
  onAction,
}: AttendanceRowProps) {
  const t = useAppTheme();
  const { width } = useWindowDimensions();
  const rowWidth = Math.min(width, 720) - spacing.lg * 2;
  const commitDir = mode === "suggested" ? 1 : -1; // right vs left
  const actionColor = mode === "suggested" ? t.success : t.danger;
  const actionIcon = mode === "suggested" ? "checkmark-circle" : "arrow-undo";

  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(72);
  const opacity = useSharedValue(1);

  const fling = () => {
    "worklet";
    translateX.value = withTiming(commitDir * rowWidth, { duration: 180 });
    opacity.value = withTiming(0, { duration: 180 });
    itemHeight.value = withTiming(0, { duration: 200 }, (done) => {
      if (done) runOnJS(onAction)();
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      // Only allow dragging in the committable direction.
      const x = e.translationX;
      translateX.value = commitDir === 1 ? Math.max(0, x) : Math.min(0, x);
    })
    .onEnd((e) => {
      const dragged = Math.abs(translateX.value);
      const flung = e.velocityX * commitDir > VELOCITY_COMMIT;
      if (dragged > rowWidth * SWIPE_THRESHOLD || flung) {
        fling();
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const tap = Gesture.Tap()
    .maxDistance(8)
    .onEnd(() => {
      fling();
    });

  const composed = Gesture.Exclusive(pan, tap);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const containerStyle = useAnimatedStyle(() => ({
    height: itemHeight.value,
  }));

  const actionLayerStyle = useAnimatedStyle(() => {
    const progress = Math.min(
      Math.abs(translateX.value) / (rowWidth * SWIPE_THRESHOLD),
      1
    );
    return {
      opacity: interpolate(progress, [0, 1], [0, 1]),
    };
  });

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      {/* Coloured action layer revealed underneath as the card slides away. */}
      <Animated.View
        style={[
          styles.actionLayer,
          actionLayerStyle,
          {
            backgroundColor: actionColor,
            alignItems: mode === "suggested" ? "flex-start" : "flex-end",
          },
        ]}
      >
        <Ionicons name={actionIcon} size={22} color="#fff" />
      </Animated.View>

      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.card, { backgroundColor: t.card }, cardStyle]}>
          <Avatar photo={photo ?? null} name={name} size={40} />
          <View style={styles.text}>
            <Text style={[typography.headline, { color: t.text }]} numberOfLines={1}>
              {name}
            </Text>
            {subtitle ? (
              <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Ionicons
            name={mode === "suggested" ? "arrow-forward-circle-outline" : "checkmark-circle"}
            size={22}
            color={mode === "suggested" ? t.faint : t.success}
          />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export const AttendanceRow = memo(AttendanceRowBase);

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  actionLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.lg,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 72,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  text: { flex: 1, gap: 2 },
});
