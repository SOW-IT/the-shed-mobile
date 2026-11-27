import { STRIDE_RATE } from "./gait";

/** One hand or foot: how far forward along the heading it is, and how far up. In body units. */
type LimbOffset = { fwd: number; up: number };

type Limbs = {
  /** [left, right] hands, away from where they hang at rest. */
  hands: readonly [LimbOffset, LimbOffset];
  /** [left, right] feet, away from where they stand at rest. */
  feet: readonly [LimbOffset, LimbOffset];
  /** The body rising and falling with a breath, standing still. */
  breath: number;
  /** The body swaying from side to side, standing still. */
  sway: number;
  /** Both hands drifting across a little behind the sway. */
  handsAcross: number;
};

const HAND_SWING = 0.14;
// A hand swinging forward rises more than one swinging back, so the swing
// reads from any side, not as both arms flapping out together.
const FORWARD_RISE = 0.8;
const BACK_RISE = 0.1;
const FOOT_STEP = 0.16;
const FOOT_LIFT = 0.09;
const BREATH_S = 3.6;
const SWAY_S = 5.2;
const BREATH = 0.018;
const SWAY = 0.024;
const HAND_DRIFT = 0.02;
const HANDS_LAG = 0.7;

const still: LimbOffset = { fwd: 0, up: 0 };
export const RESTING_LIMBS: Limbs = { hands: [still, still], feet: [still, still], breath: 0, sway: 0, handsAcross: 0 };

/**
 * Where the hands and feet are, driven by the same stride as the body's bob.
 * Walking, each arm swings with the opposite foot. A foot lifts as it swings
 * forward and peaks as the body does, so it never drops away from the body.
 * Standing still with `sway` on, the body breathes and sways and the arms
 * follow it a beat behind; the feet stay planted. The sway fades in as the
 * stride fades out, so stopping is smooth.
 */
export const limbsFor = (stride: { stridePhase: number; strideAmp: number } | undefined, sway: { t: number; seed: number } | null): Limbs => {
  const amp = stride?.strideAmp ?? 0;
  const idle = sway ? 1 - amp : 0;
  if (amp <= 0 && idle <= 0) return RESTING_LIMBS;
  const phase = (stride?.stridePhase ?? 0) * STRIDE_RATE;
  const c = Math.cos(phase) * amp;
  const s = Math.sin(phase) * amp;
  const breathK = sway ? (sway.t / BREATH_S) * Math.PI * 2 + sway.seed : 0;
  const swayK = sway ? (sway.t / SWAY_S) * Math.PI * 2 + sway.seed * 1.7 : 0;
  const drift = Math.sin(breathK - HANDS_LAG) * HAND_DRIFT * idle;
  const hand = (e: -1 | 1): LimbOffset => {
    const swing = e * c * HAND_SWING;
    return { fwd: swing + drift, up: swing > 0 ? swing * FORWARD_RISE : -swing * BACK_RISE };
  };
  const foot = (e: -1 | 1): LimbOffset => ({ fwd: -e * c * FOOT_STEP, up: Math.max(0, e * s) * FOOT_LIFT });
  return {
    hands: [hand(-1), hand(1)],
    feet: [foot(-1), foot(1)],
    breath: ((1 - Math.cos(breathK)) / 2) * BREATH * idle,
    sway: Math.sin(swayK) * SWAY * idle,
    handsAcross: Math.sin(swayK - HANDS_LAG) * SWAY * 0.6 * idle,
  };
};
