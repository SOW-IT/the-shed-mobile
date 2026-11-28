import { fixedColours, spacing, typography, useAppTheme, USE_NATIVE_DRIVER } from "@/theme";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { lookFor, withHeight, type Look } from "@shared/world";
import { api } from "../../../convex/_generated/api";
import { CURRENT_GAME_VERSION, type GameId, type GameVersion } from "../../../shared/games";
import { podiumSteps, type PodiumStep } from "@/lib/games/podium";
import { useAvatarArt, type AvatarArt } from "./GameCharacter";
import { useSavedNames } from "./useSavedNames";

const p = fixedColours.games.podium;
const FIGURE = { width: 76, height: 94 };
const STEP_MAX = 64;
const BOUNCE_MS = 520;
/** Each place starts its bounce a little after the last, so they don't move as one. */
const STAGGER_MS = 170;
const SPARKS = [
  { x: -34, y: 8, size: 12, at: 0 },
  { x: 32, y: 0, size: 10, at: 0.4 },
  { x: 22, y: 34, size: 9, at: 0.7 },
];

/**
 * A bounce and sparkles that loop on the native driver: nothing in React
 * changes per frame. Still with Reduce Motion on.
 */
const useCheer = (order: number, calm: boolean) => {
  const [clock] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (calm) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(order * STAGGER_MS),
        Animated.timing(clock, { toValue: 1, duration: BOUNCE_MS, easing: Easing.out(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.timing(clock, { toValue: 0, duration: BOUNCE_MS, easing: Easing.in(Easing.quad), useNativeDriver: USE_NATIVE_DRIVER }),
        Animated.delay((3 - order) * STAGGER_MS),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [calm, clock, order]);
  return clock;
};

const Figure = ({ look, art }: { look: Look; art: AvatarArt | null }) => {
  if (art) return <art.CheeringCharacter look={look} width={FIGURE.width} height={FIGURE.height} />;
  return <View style={styles.loadingSlot} />;
};

const Step = ({
  step,
  art,
  nameOf,
  calm,
}: {
  step: PodiumStep<PodiumRow>;
  art: AvatarArt | null;
  nameOf: (name: string) => string;
  calm: boolean;
}) => {
  const t = useAppTheme();
  const clock = useCheer(step.order, calm || step.entry === null);
  const entry = step.entry;
  const shade = step.order - 1;
  const name = entry ? nameOf(entry.name) : "";
  const look = entry ? (entry.look ?? withHeight(lookFor(entry.id), entry.id)) : null;
  const lift = clock.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const shadowScale = clock.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  return (
    <View style={styles.column} testID={`podium-step-${step.order}`}>
      {entry && look ? (
        <>
          <View style={styles.header}>
            <Text style={[typography.label, styles.name, { color: t.text }, entry.isMe && styles.me]} numberOfLines={1}>
              {entry.isMe ? `${name} (you)` : name}
            </Text>
            <Text style={[typography.caption, styles.score, { color: t.muted }]} numberOfLines={1}>
              {entry.score.toLocaleString()}
            </Text>
          </View>
          <View style={styles.stage}>
            <Animated.View style={[styles.shadow, { transform: [{ scaleX: shadowScale }] }]} pointerEvents="none" />
            <Animated.View style={{ transform: [{ translateY: lift }] }}>
              <Figure look={look} art={art} />
            </Animated.View>
            {calm ? null : (
              // Decoration: hidden from screen readers, which read the step instead.
              <View style={styles.sparks} pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants">
                {SPARKS.map((spark) => (
                  <Animated.Text
                    key={`${spark.x},${spark.y}`}
                    style={[
                      styles.spark,
                      {
                        fontSize: spark.size,
                        transform: [{ translateX: spark.x }, { translateY: spark.y }],
                        opacity: clock.interpolate({ inputRange: [0, spark.at * 0.5 + 0.2, 1], outputRange: [0.1, 1, 0.1], extrapolate: "clamp" }),
                      },
                    ]}
                  >
                    ✦
                  </Animated.Text>
                ))}
              </View>
            )}
          </View>
        </>
      ) : null}
      <View
        style={[styles.step, { height: Math.round(STEP_MAX * step.height) + 18, backgroundColor: p.steps[shade], borderColor: p.edges[shade] }]}
        accessible={entry !== null}
        accessibilityLabel={entry ? `${ordinal(entry.rank)}: ${name}, ${entry.score.toLocaleString()}` : undefined}
      >
        <Text style={styles.number}>{entry ? entry.rank : ""}</Text>
      </View>
    </View>
  );
};

const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

type PodiumRow = { id: string; name: string; score: number; isMe: boolean; look: Look | null };

/**
 * The top three of a game's leaderboard on a podium, cheering: 1st in the
 * middle and highest, 2nd on the left, 3rd on the right, each standing on
 * top of their step as their full Garden character. Nothing shows until
 * someone has a score.
 */
export const Podium = ({ game, version = CURRENT_GAME_VERSION[game] }: { game: GameId; version?: GameVersion }) => {
  const rows = useQuery(api.gameScores.podium, { game, version });
  const nameOf = useSavedNames();
  const art = useAvatarArt((rows?.length ?? 0) > 0);
  const calm = useReducedMotion();
  const steps = rows ? podiumSteps(rows) : null;
  if (!steps) return null;
  return (
    <View style={styles.podium} testID="leaderboard-podium">
      {steps.map((step) => (
        <Step key={step.order} step={step} art={art} nameOf={nameOf} calm={calm} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  podium: { flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: spacing.sm, paddingTop: spacing.md },
  column: { flex: 1, maxWidth: 124, alignItems: "center" },
  header: { alignItems: "center", marginBottom: spacing.xs + 2, maxWidth: "100%" },
  stage: { width: FIGURE.width, height: FIGURE.height, alignItems: "center", justifyContent: "flex-end", marginBottom: -4, zIndex: 1 },
  loadingSlot: { width: FIGURE.width, height: FIGURE.height },
  shadow: { position: "absolute", bottom: -1, width: 32, height: 8, borderRadius: 4, backgroundColor: p.shadow },
  sparks: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center" },
  spark: { position: "absolute", top: 4, color: p.spark },
  name: { maxWidth: "100%" },
  score: { fontVariant: ["tabular-nums"] },
  me: { fontWeight: "800" },
  step: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 2,
    borderBottomWidth: 0,
  },
  number: { ...typography.title, color: p.number },
});
