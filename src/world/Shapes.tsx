import { Fragment, memo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { QUAD_SIZE, quadMatrix } from "./camera";
import { flatPieces, parallelogramWarp } from "./flatQuad";
import type { Prim } from "./gardenScene";
import { shade } from "./palette";

/**
 * The transform that warps a quad into place. iOS takes a 16-value `matrix`;
 * react-native-web passes `matrix` through as CSS `matrix()`, which only
 * takes six, so the web gets `matrix3d`.
 */
export const quadTransform = (q: readonly { x: number; y: number }[]) => {
  if (Platform.OS === "android") return parallelogramWarp(q) ?? HIDDEN;
  const matrix = quadMatrix(q);
  // react-native-web reads the key; React Native's types only know `matrix`.
  return Platform.OS === "web" ? [{ matrix3d: matrix } as unknown as { matrix: number[] }] : [{ matrix }];
};

const HIDDEN = [{ scale: 0 }];

export const FlatQuad = ({ pts, fill, radius = 0 }: { pts: readonly { x: number; y: number }[]; fill: string; radius?: number }) => (
  <>
    {flatPieces(pts, radius).map((piece) => {
      if (piece.kind === "dot") {
        return (
          <View
            key={piece.key}
            pointerEvents="none"
            style={[styles.abs, { left: piece.x - piece.r, top: piece.y - piece.r, width: piece.r * 2, height: piece.r * 2, borderRadius: piece.r, backgroundColor: fill }]}
          />
        );
      }
      if (piece.kind === "triangle") {
        return <View key={piece.key} pointerEvents="none" style={[styles.triangle, { borderBottomColor: fill, transform: piece.transform }]} />;
      }
      return <View key={piece.key} pointerEvents="none" style={[styles.quad, { backgroundColor: fill, borderRadius: radius, transform: piece.transform }]} />;
    })}
  </>
);

export const flatQuad = (pts: readonly { x: number; y: number }[], fill: string, key: string, radius = 0) => (
  <Fragment key={key}>
    <FlatQuad pts={pts} fill={fill} radius={radius} />
  </Fragment>
);

/** One flat shape of the scene. Nothing in the scene takes touches itself. */
export const Shape = memo(function Shape({ prim }: { prim: Prim }) {
  if (prim.kind === "quad" && Platform.OS === "android" && !prim.border) return <FlatQuad pts={prim.pts} fill={prim.fill} radius={prim.radius} />;
  if (prim.kind === "quad") {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.quad,
          {
            backgroundColor: prim.fill,
            borderRadius: prim.radius,
            borderWidth: prim.border,
            borderColor: prim.borderColour,
            transform: quadTransform(prim.pts),
          },
        ]}
      />
    );
  }
  if (prim.kind === "line") {
    const dx = prim.b.x - prim.a.x;
    const dy = prim.b.y - prim.a.y;
    const length = Math.hypot(dx, dy) + prim.width;
    return (
      <View
        pointerEvents="none"
        style={[
          styles.abs,
          {
            left: (prim.a.x + prim.b.x) / 2 - length / 2,
            top: (prim.a.y + prim.b.y) / 2 - prim.width / 2,
            width: length,
            height: prim.width,
            borderRadius: prim.width / 2,
            backgroundColor: prim.colour,
            transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
          },
        ]}
      />
    );
  }
  const { key: _key, kind: _kind, ...ellipse } = prim;
  return <Ellipse {...ellipse} />;
});

/**
 * An ellipse, drawn as a circle squashed upright so it's an ellipse on every
 * platform. `ramp` adds the toon steps: a lighter ball toward the sun.
 */
export const Ellipse = memo(function Ellipse({
  cx,
  cy,
  rx,
  ry,
  fill,
  ink,
  inkColour,
  dashed,
  ramp,
  opacity,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  fill: string;
  ink?: number;
  inkColour?: string;
  dashed?: boolean;
  ramp?: boolean;
  opacity?: number;
}) {
  if (rx <= 0 || ry <= 0) return null;
  const squash = ry / rx;
  // Ink is a circle behind the fill, not a border: on iOS a clipped child
  // would paint over a border.
  // A see-through ellipse with ink is a ring: draw the ink as a border.
  const ring = dashed || fill === "transparent";
  const solidInk = ink && !ring ? ink : 0;
  const inner = rx - solidInk;
  return (
    <View
      pointerEvents="none"
      style={[
        styles.abs,
        {
          left: cx - rx,
          top: cy - rx,
          width: rx * 2,
          height: rx * 2,
          borderRadius: rx,
          backgroundColor: solidInk ? inkColour : ring ? undefined : fill,
          borderWidth: ring && ink ? ink / Math.max(0.3, squash) : 0,
          borderColor: inkColour,
          borderStyle: dashed ? "dashed" : undefined,
          opacity,
          transform: [{ scaleY: squash }],
        },
      ]}
    >
      {solidInk || ramp ? (
        <View
          style={[
            styles.abs,
            {
              left: solidInk,
              top: solidInk,
              width: inner * 2,
              height: inner * 2,
              borderRadius: inner,
              backgroundColor: ramp ? shade(fill, -0.14) : fill,
              overflow: "hidden",
            },
          ]}
        >
          {ramp ? (
            <>
              <View
                style={[
                  styles.abs,
                  { left: inner * 0.12, top: -inner * 0.22, width: inner * 1.95, height: inner * 1.95, borderRadius: inner, backgroundColor: fill },
                ]}
              />
              <View
                style={[
                  styles.abs,
                  {
                    left: inner * 0.95,
                    top: inner * 0.3,
                    width: inner * 0.55,
                    height: inner * 0.55,
                    borderRadius: inner,
                    backgroundColor: shade(fill, 0.22),
                  },
                ]}
              />
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  abs: { position: "absolute" },
  quad: { position: "absolute", left: 0, top: 0, width: QUAD_SIZE, height: QUAD_SIZE },
  triangle: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: QUAD_SIZE,
    borderBottomWidth: QUAD_SIZE,
    borderLeftColor: "transparent",
  },
});
