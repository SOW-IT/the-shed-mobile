import { fixedColours, spacing, typography, useAppTheme, USE_NATIVE_DRIVER } from "@/theme";
import { useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { Look } from "@shared/world";
import { api } from "../../../convex/_generated/api";
import { GAME_VERSION, type GameId, type GameVersion } from "../../../shared/games";
import { podiumSteps, type PodiumStep } from "@/lib/games/podium";
import { useAvatarArt, type AvatarArt } from "./GameCharacter";
import { useSavedNames } from "./useSavedNames";

const p = fixedColours.games.podium;
const FIGURE = { width: 64, height: 76 };
const STEP_MAX = 64;
const BOUNCE_MS = 520;
/** Each place starts its bounce a little after the last, so they don't move as one. */
const STAGGER_MS = 170;
const SPARKS = [
  { x: -30, y: 6, size: 12, at: 0 },
  { x: 28, y: -2, size: 10, at: 0.4 },
  { x: 18, y: 30, size: 9, at: 0.7 },
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

const Figure = ({ look, name, art }: { look: Look | null; name: string; art: AvatarArt | null }) => {
  if (look && art) return <art.CheeringCharacter look={look} width={FIGURE.width} height={FIGURE.height} />;
  return (
    <View style={styles.faceSlot}>
      {/* A face still loading is blank; someone with no World character gets their initial. */}
      <View style={styles.face}>{look ? null : <Text style={styles.initial}>{Array.from(name)[0] ?? "?"}</Text>}</View>
    </View>
  );
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
  const lift = clock.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  return (
    <View style={styles.column} testID={`podium-step-${step.order}`}>
      {entry ? (
        <>
          <View style={styles.stage}>
            <Animated.View style={{ transform: [{ translateY: lift }] }}>
              <Figure look={entry.look} name={name} art={art} />
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
          <Text style={[typography.label, styles.name, { color: t.text }, entry.isMe && styles.me]} numberOfLines={1}>
            {entry.isMe ? `${name} (you)` : name}
          </Text>
          <Text style={[typography.caption, styles.score, { color: t.muted }]}>{entry.score.toLocaleString()}</Text>
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
 * middle and highest, 2nd on the left, 3rd on the right, each as their World
 * character. Nothing shows until someone has a score.
 */
export const Podium = ({ game, version = GAME_VERSION }: { game: GameId; version?: GameVersion }) => {
  const rows = useQuery(api.gameScores.podium, { game, version });
  const nameOf = useSavedNames();
  const art = useAvatarArt(rows?.some((row) => row.look !== null) ?? false);
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
  column: { flex: 1, maxWidth: 120, alignItems: "center" },
  stage: { width: FIGURE.width, height: FIGURE.height, alignItems: "center", justifyContent: "flex-end" },
  faceSlot: { width: FIGURE.width, height: FIGURE.height, alignItems: "center", justifyContent: "flex-end", paddingBottom: 6 },
  face: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: p.face },
  initial: { ...typography.headline, color: p.faceText },
  sparks: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center" },
  spark: { position: "absolute", top: 4, color: p.spark },
  name: { marginTop: spacing.xs, maxWidth: "100%" },
  me: { fontWeight: "800" },
  score: { marginBottom: spacing.xs },
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
