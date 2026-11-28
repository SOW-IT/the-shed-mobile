import { bodyScale, type Look } from "@shared/world";
import { memo, useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Avatar, figureTop, type Doing } from "./Person";

const STILL = { x: 0, z: 0, walking: false, arrivesAt: 0 } as const;
const RUNNING_HEADING = 1.15;
// Two running frames a half stride apart, each mid-swing: arms and feet
// apart, one foot coming up.
const STRIDE_PHASES = [Math.PI / 48, (5 * Math.PI) / 48];
const UP = 0.86;

const fitScale = (look: Look, height: number) => height / figureTop(look, UP);

/** How far into the top of the head something worn there sits, per scale. */
const HEADWEAR_SINK = 0.1;

const Figure = ({
  look,
  width,
  height,
  heading,
  stridePhase,
  doing,
  fitTo = look,
}: {
  look: Look;
  width: number;
  height: number;
  heading: number;
  stridePhase?: number;
  doing?: Doing;
  /** The look whose height fills the box, when it isn't the one drawn. */
  fitTo?: Look;
}) => {
  const s = fitScale(fitTo, height);
  const foot = { x: width / 2, y: height, depth: 1, scale: s };
  return (
    <View pointerEvents="none" style={{ width, height }}>
      <Avatar
        figure={{ foot, s, up: s * UP, bob: 0 }}
        pose={{ ...STILL, heading, walking: stridePhase !== undefined }}
        look={look}
        t={0}
        seed={0}
        stride={stridePhase === undefined ? undefined : { stridePhase, strideAmp: 1 }}
        doing={doing}
        shadow={false}
      />
    </View>
  );
};

/** The World's Cheer emote held still: arms up, happy face. Whoever draws it bounces it. */
const CHEER: Doing = { kind: "emote", id: "cheer", p: 0.5 };

export const CheeringCharacter = memo(function CheeringCharacter({ look, width, height }: { look: Look; width: number; height: number }) {
  return <Figure look={look} width={width} height={height} heading={0} doing={CHEER} />;
});

/** Hop's turn: three-quarters to the side you're steering, so it reads from behind or in front. */
const HOP_HEADING = 0.95;

/**
 * Hop's character: the whole figure, turned to the side it's steering, with
 * its arms up while a boost carries it. Whoever draws it squashes it.
 * `headwear` (a propeller hat) sits on the top of the head in place of any
 * hat, over hair that stands up, at the same size as with the hat on.
 */
export const HopperCharacter = memo(function HopperCharacter({
  look,
  width,
  height,
  facing,
  boosting,
  headwear,
}: {
  look: Look;
  width: number;
  height: number;
  facing: -1 | 1;
  boosting: boolean;
  headwear?: ReactNode;
}) {
  const heading = facing * HOP_HEADING;
  const doing = boosting ? CHEER : undefined;
  if (headwear === undefined) return <Figure look={look} width={width} height={height} heading={heading} doing={doing} />;
  const bare = { ...look, hat: 0 };
  const s = fitScale(look, height);
  const headTop = height - s * figureTop(bare, UP);
  return (
    <View pointerEvents="none" style={{ width, height }}>
      <Figure look={bare} fitTo={look} width={width} height={height} heading={heading} doing={doing} />
      <View style={[styles.headwear, { bottom: height - headTop - s * HEADWEAR_SINK }]}>{headwear}</View>
    </View>
  );
});

export const RunnerCharacter = memo(function RunnerCharacter({
  look,
  width,
  height,
  sliding,
  stride,
  airborne,
}: {
  look: Look;
  width: number;
  height: number;
  sliding: boolean;
  stride: number;
  airborne: boolean;
}) {
  const frames = useMemo(
    () =>
      STRIDE_PHASES.map((phase) => (
        <Figure key={phase} look={look} width={width} height={height} heading={RUNNING_HEADING} stridePhase={phase} />
      )),
    [look, width, height]
  );
  const shown = airborne ? 0 : stride < 0.5 ? 0 : 1;
  const bob = airborne || sliding ? 0 : -Math.abs(Math.sin(stride * Math.PI * 2)) * 2;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.runner,
        { width, height },
        { transform: sliding ? [{ rotate: "72deg" }, { scale: 0.72 }] : [{ translateY: bob }, { rotate: airborne ? "-6deg" : "0deg" }] },
      ]}
    >
      {frames.map((frame, i) => (
        <View key={STRIDE_PHASES[i]} style={[StyleSheet.absoluteFill, { opacity: i === shown ? 1 : 0 }]}>
          {frame}
        </View>
      ))}
    </View>
  );
});

export const CharacterHead = memo(function CharacterHead({ look, size }: { look: Look; size: number }) {
  const top = figureTop(look, UP);
  const centre = bodyScale(look).height * UP;
  const s = size / (top - centre + 0.41);
  const width = size * 1.6;
  const centreY = Math.round((top - centre) * s);
  const chinWidth = Math.round(0.9 * s);
  const chinLeft = (width - chinWidth) / 2;
  const avatar = (
    <Avatar
      figure={{ foot: { x: width / 2, y: top * s, depth: 1, scale: s }, s, up: s * UP, bob: 0 }}
      pose={{ ...STILL, heading: 0.35 }}
      look={look}
      t={0}
      seed={0}
      shadow={false}
    />
  );
  return (
    <View pointerEvents="none" style={{ width, height: size, marginHorizontal: -size * 0.3 }}>
      <View style={[styles.clip, { left: 0, top: 0, width, height: centreY + Math.round(0.2 * s) }]}>{avatar}</View>
      <View
        style={[
          styles.clip,
          {
            left: chinLeft,
            top: centreY,
            width: chinWidth,
            height: size - centreY,
            borderBottomLeftRadius: chinWidth / 2,
            borderBottomRightRadius: chinWidth / 2,
          },
        ]}
      >
        <View style={{ position: "absolute", left: -chinLeft, top: -centreY, width, height: size }}>{avatar}</View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  runner: { transformOrigin: "bottom center" },
  clip: { position: "absolute", overflow: "hidden" },
  headwear: { position: "absolute", left: 0, right: 0, alignItems: "center" },
});
