import { Btn, ConfirmDialog, FastModal } from "@/components/ui";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import Ionicons from "@expo/vector-icons/Ionicons";
import { spacing, typography, useAppTheme } from "@/theme";
import {
  ACCESSORIES,
  BEARDS,
  BLUSH,
  bodyScale,
  BROWS,
  customColour,
  customRgb,
  EYES,
  EYESHADOW,
  FACES,
  FRECKLES,
  FULL_OUTFITS,
  GLASSES,
  HAIR_STYLES,
  HATS,
  LIPSTICK,
  LOOK_SIZES,
  LOOK_VERSION,
  lookPart,
  MOLES,
  MOUTHS,
  NOSES,
  NUDGES_RESET,
  OLD_GLASSES,
  OUTFITS,
  PANTS,
  randomLook,
  SLEEVELESS,
  SLEEVES,
  type Look,
  type LookPart,
  type NudgePart,
} from "@shared/world";
import { createContext, memo, useCallback, useContext, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentProps, type ComponentRef } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ColourPicker } from "./ColourPicker";
import { garden, hexRgb, hud, isLight, lightToDark, people, rgbHex, shade } from "./palette";
import { Avatar, figureTop } from "./Person";
import {
  PREVIEW_AUTO_TURN,
  PREVIEW_GLIDE_MS,
  PREVIEW_SPIN_DECAY,
  PREVIEW_SPIN_STOP,
  previewAutoWaitMs,
  previewCloseUp,
  previewEaseInOut,
  previewGoalMoved,
  previewNeedsFrame,
  previewRecenters,
  type PreviewGlide,
  type PreviewShot,
  type PreviewSpin,
} from "./previewMotion";
import {
  clampZoom,
  keyZoom,
  manualZoomFor,
  pinchLift,
  pinchMove,
  PINCH_GRACE_MS,
  PINCH_IDLE,
  sliderZoom,
  wheelZoom,
  ZOOM_A11Y_STEP,
  zoomFrame,
  zoomLimits,
  zoomOf,
  type ManualZoom,
  type PinchState,
} from "./previewZoom";
import { useBatterySaver } from "./settings";
import { Ellipse } from "./Shapes";
import { useForeground } from "./useForeground";

const BASE_PREVIEW = 148;
const MAX_PREVIEW = 300;
const COLUMN_WIDTH = 560;
const WIDE_COLUMN = 960;
const SHORT_SCREEN = 600;
const SIDE_BY_SIDE_WIDTH = 560;
const SHORT_PREVIEW = 110;
/** The preview's scale close up on the face, at the base preview height. */
const CLOSE_UP = 140;
const HEAD_SHOT = 118;
/**
 * Close on one part of the face: its scale at the base preview height, and
 * how far its middle sits below the middle of the head (times the scale).
 */
const FEATURES = {
  eyes: { s: 240, below: 0.11 },
  brows: { s: 240, below: -0.05 },
  mouth: { s: 220, below: 0.3 },
} as const;
const OUTFIT_SHOT = 200;
const EXTRAS_SHOT = 170;
/** How far below the feet the soles of the shoes reach (times the scale). */
const SOLES = 0.06;
const CLOSEST = 320;
const FACE_FOCUS = 0.12;
const ZOOM_THUMB = 24;

type Shot = PreviewShot;

const shotFor = (shot: Shot, look: Look, height: number) => {
  const zoom = height / BASE_PREVIEW;
  const footY = height - 28 * zoom;
  const neck = bodyScale(look).height * 0.86;
  if (shot === "full") {
    // Full size, unless the tallest looks (a tall afro, say) would poke out of
    // the top: then just small enough to fit.
    const tallest = { ...look, height: LOOK_SIZES.height - 1 };
    const s = Math.min(100 * zoom, (footY - 6) / figureTop(tallest, 0.86));
    return { s, y: footY };
  }
  if (shot === "face") {
    // Close up on the face while you work on it, so a slider's step shows.
    const s = CLOSE_UP * zoom;
    return { s, y: height * 0.56 + neck * s, focus: neck - FACE_FOCUS };
  }
  if (shot === "eyes" || shot === "brows" || shot === "mouth") {
    // Closer still, on the one part. The camera stays put while a slider
    // moves the part, so you see it move.
    const part = FEATURES[shot];
    const s = part.s * zoom;
    return { s, y: height * 0.5 + (neck - part.below) * s };
  }
  if (shot === "outfit") {
    // From the mouth down to the shoes: the top, the bottoms and the shoes.
    const top = neck - 0.3;
    const s = Math.min(OUTFIT_SHOT * zoom, Math.max(1, height - 16) / (top + SOLES));
    return { s, y: height / 2 + ((top - SOLES) / 2) * s };
  }
  if (shot === "extras") {
    // The head down to the waist: where the extras go, from headphones and
    // an ear flower to the bottom of a backpack. (`neck` is the middle of the
    // head, so the chin is 0.42 below it.)
    const top = Math.min(figureTop(look, 0.86), neck + 0.5);
    const bottom = neck * 0.2;
    const s = Math.min(EXTRAS_SHOT * zoom, Math.max(1, height - 16) / (top - bottom));
    return { s, y: height / 2 + ((top + bottom) / 2) * s };
  }
  const middle = height * 0.6;
  const above = Math.max(0.5, figureTop(look, 0.86) - neck);
  const s = Math.min(HEAD_SHOT * zoom, Math.max(1, middle - 8) / above);
  return { s, y: middle + neck * s };
};

/** Turns per pixel dragged (radians). */
const TURN_PER_PX = 0.012;
const AUTO_START_MS = 3000;
const MAX_SPIN = 12;

/**
 * The character on a patch of lawn. It turns slowly on its own; swipe (or
 * drag with a mouse) to turn it by hand, with a little momentum when you let
 * go. The swipe stays on the preview: it doesn't scroll the list or close the
 * sheet. All on this phone; nothing is sent.
 */
const Preview = ({ look, active, height, shot }: { look: Look; active: boolean; height: number; shot: Shot }) => {
  const reduceMotion = useBatterySaver();
  const foreground = useForeground();
  const running = active && foreground;
  const [width, setWidth] = useState(0);
  const [manual, setManual] = useState<ManualZoom>(null);
  const [zoomFor, setZoomFor] = useState({ active, shot });
  if (zoomFor.active !== active || zoomFor.shot !== shot) {
    setZoomFor({ active, shot });
    setManual(null);
  }
  const manualZoom = manualZoomFor(manual, shot);
  const tabGoal = shotFor(shot, look, height);
  const fullGoal = shotFor("full", look, height);
  const limits = zoomLimits(fullGoal, tabGoal, CLOSEST * (height / BASE_PREVIEW));
  const goal = zoomFrame({ full: fullGoal, tab: tabGoal, height, limits }, manualZoom);
  const tabZoom = zoomOf(tabGoal.s, limits);
  const zoom = manualZoom ?? tabZoom;
  const snap = manualZoom !== null;
  const [frame, setFrame] = useState({ heading: 0, s: goal.s, y: goal.y });
  const spin = useRef<PreviewSpin>({ down: false, lastX: 0, lastAt: 0, velocity: 0, heading: 0, openedAt: 0, touched: false });
  const pinch = useRef<PinchState>(PINCH_IDLE);
  const grabbed = useRef({ heading: 0, at: 0 });
  const box = useRef<ComponentRef<typeof View>>(null);
  const closeUpNow = useRef(previewCloseUp(shot));
  const shotNow = useRef(shot);
  const goalNow = useRef({ s: goal.s, y: goal.y, still: reduceMotion, snap });
  const glideRef = useRef<PreviewGlide>({
    from: { s: goal.s, y: goal.y },
    to: { s: goal.s, y: goal.y },
    at: 0,
    now: { s: goal.s, y: goal.y },
  });
  const wakeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!active) return;
    const start = Date.now();
    spin.current = { down: false, lastX: 0, lastAt: start, velocity: 0, heading: 0, openedAt: start, touched: false };
    const init = { s: goalNow.current.s, y: goalNow.current.y };
    glideRef.current = { from: init, to: init, at: start - PREVIEW_GLIDE_MS, now: init };
    setFrame({ heading: 0, s: init.s, y: init.y });
  }, [active]);

  useEffect(() => {
    if (!running) return;
    let rafId = 0;
    let autoTimer: ReturnType<typeof setTimeout> | null = null;
    let prev = Date.now();
    let wasShot = shotNow.current;

    const clearAuto = () => {
      if (autoTimer !== null) {
        clearTimeout(autoTimer);
        autoTimer = null;
      }
    };

    const scheduleAuto = (now: number) => {
      clearAuto();
      const wait = previewAutoWaitMs({
        spin: spin.current,
        closeUp: closeUpNow.current,
        still: goalNow.current.still,
        now,
      });
      if (wait !== null) {
        autoTimer = setTimeout(() => {
          autoTimer = null;
          schedule();
        }, wait);
      }
    };

    const tick = () => {
      rafId = 0;
      const now = Date.now();
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const target = goalNow.current;
      const glide = glideRef.current;
      if (previewGoalMoved(glide, target)) {
        glide.from = glide.now;
        glide.to = { s: target.s, y: target.y };
        glide.at = now;
      }
      const k = target.still || target.snap ? 1 : previewEaseInOut(Math.min(1, (now - glide.at) / PREVIEW_GLIDE_MS));
      glide.now = {
        s: glide.from.s + (glide.to.s - glide.from.s) * k,
        y: glide.from.y + (glide.to.y - glide.from.y) * k,
      };
      const d = spin.current;
      if (previewRecenters(wasShot, shotNow.current) && !d.down) {
        d.touched = false;
        d.velocity = 0;
      }
      wasShot = shotNow.current;
      if (!d.down) {
        if (Math.abs(d.velocity) > PREVIEW_SPIN_STOP) {
          d.heading += d.velocity * dt;
          d.velocity *= Math.exp(-PREVIEW_SPIN_DECAY * dt);
          if (Math.abs(d.velocity) <= PREVIEW_SPIN_STOP) d.velocity = 0;
        } else if (!d.touched && closeUpNow.current) {
          const front = Math.round(d.heading / (Math.PI * 2)) * Math.PI * 2;
          d.heading = target.still ? front : d.heading + (front - d.heading) * Math.min(1, dt * 3);
        } else if (!d.touched && !target.still && now - d.openedAt >= AUTO_START_MS) {
          d.heading += PREVIEW_AUTO_TURN * dt;
        }
      }
      setFrame((cur) =>
        cur.heading === d.heading && cur.s === glide.now.s && cur.y === glide.now.y
          ? cur
          : { heading: d.heading, s: glide.now.s, y: glide.now.y }
      );
      if (previewNeedsFrame({ glide, spin: d, target, closeUp: closeUpNow.current, now })) {
        rafId = requestAnimationFrame(tick);
      } else {
        scheduleAuto(now);
      }
    };

    const schedule = () => {
      if (rafId !== 0) return;
      clearAuto();
      prev = Date.now();
      rafId = requestAnimationFrame(tick);
    };

    wakeRef.current = schedule;
    schedule();

    return () => {
      wakeRef.current = () => undefined;
      if (rafId !== 0) cancelAnimationFrame(rafId);
      clearAuto();
    };
  }, [running]);

  useEffect(() => {
    closeUpNow.current = previewCloseUp(shot);
    shotNow.current = shot;
    goalNow.current = { s: goal.s, y: goal.y, still: reduceMotion, snap };
    wakeRef.current();
  }, [shot, goal.s, goal.y, reduceMotion, snap]);

  const { low, high } = limits;
  useEffect(() => {
    const node = box.current as unknown as HTMLElement | null;
    if (Platform.OS !== "web" || !node) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setManual((cur) => ({ shot, zoom: wheelZoom(manualZoomFor(cur, shot) ?? tabZoom, e.deltaY, { low, high }) }));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [shot, tabZoom, low, high]);

  const pickZoom = (next: number) => setManual({ shot, zoom: next });

  const onGrant = (e: GestureResponderEvent) => {
    const d = spin.current;
    d.down = true;
    d.lastX = e.nativeEvent.pageX;
    d.lastAt = Date.now();
    d.velocity = 0;
    d.touched = true;
    grabbed.current = { heading: d.heading, at: d.lastAt };
    pinch.current = PINCH_IDLE;
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = spin.current;
    const touches = e.nativeEvent.touches ?? [];
    const now = Date.now();
    if (touches.length >= 2 || pinch.current.pinched) {
      const spread = touches.length >= 2 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : 0;
      const step = pinchMove(pinch.current, { fingers: touches.length, spread, zoom, limits });
      pinch.current = step.state;
      if (step.began) {
        if (now - grabbed.current.at <= PINCH_GRACE_MS) d.heading = grabbed.current.heading;
        d.velocity = 0;
        setFrame((cur) => (cur.heading === d.heading ? cur : { ...cur, heading: d.heading }));
      }
      if (step.zoom !== null) pickZoom(step.zoom);
      if (pinch.current.pinched) return;
    }
    const dx = e.nativeEvent.pageX - d.lastX;
    d.heading += dx * TURN_PER_PX;
    const dt = Math.max(1, now - d.lastAt) / 1000;
    const v = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, (dx * TURN_PER_PX) / dt));
    d.velocity = d.velocity * 0.6 + v * 0.4;
    d.lastX = e.nativeEvent.pageX;
    d.lastAt = now;
    setFrame((cur) => (cur.heading === d.heading ? cur : { ...cur, heading: d.heading }));
  };
  const onEnd = () => {
    const d = spin.current;
    d.down = false;
    if (pinch.current.pinched || Date.now() - d.lastAt > 80) d.velocity = 0;
    pinch.current = PINCH_IDLE;
    if (Math.abs(d.velocity) > PREVIEW_SPIN_STOP) wakeRef.current();
  };
  const onLift = (e: GestureResponderEvent) => {
    pinch.current = pinchLift(pinch.current, (e.nativeEvent.touches ?? []).length);
  };
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const s = frame.s;
  const foot = { x: width / 2, y: frame.y, depth: 1, scale: s };
  return (
    <View ref={box} style={{ height }}>
      <View
        style={[styles.preview, { height, backgroundColor: garden.sky }, noBrowserGestures]}
        onLayout={onLayout}
        testID="world-editor-preview"
        accessible
        accessibilityLabel="Your character. Swipe left or right to turn it, or pinch to zoom."
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderEnd={onLift}
        onResponderRelease={onEnd}
        onResponderTerminate={onEnd}
      >
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Ellipse cx={width / 2} cy={foot.y + 0.02 * s} rx={Math.min(width * 0.42, 1.5 * s)} ry={0.34 * s} fill={garden.lawn} />
          {width > 0 ? (
            <Avatar
              figure={{ foot, s, up: s * 0.86, bob: 0 }}
              pose={{ x: 0, z: 0, walking: false, heading: frame.heading, arrivesAt: 0 }}
              look={look}
              t={0}
              seed={0}
            />
          ) : null}
        </View>
      </View>
      <ZoomSlider zoom={zoom} onPick={pickZoom} />
    </View>
  );
};

const ZoomSlider = ({ zoom, onPick }: { zoom: number; onPick: (zoom: number) => void }) => {
  const [length, setLength] = useState(0);
  const pickAt = (y: number) => {
    const next = sliderZoom(y, length);
    if (next !== null) onPick(next);
  };
  const keys =
    Platform.OS === "web"
      ? ({
          tabIndex: 0,
          "aria-orientation": "vertical",
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const next = keyZoom(zoom, e.key);
            if (next === null) return;
            e.preventDefault();
            onPick(next);
          },
        } as object)
      : {};
  const percent = Math.round(zoom * 100);
  return (
    <View style={[styles.zoom, noBrowserGestures]} pointerEvents="box-none">
      <Ionicons name="add" size={16} color={hud.primary} accessibilityElementsHidden importantForAccessibility="no" />
      <View
        style={styles.zoomTrack}
        onLayout={(e) => setLength(e.nativeEvent.layout.height)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Zoom"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent}%`}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onPick(clampZoom(zoom + (e.nativeEvent.actionName === "increment" ? ZOOM_A11Y_STEP : -ZOOM_A11Y_STEP)))}
        {...keys}
        testID="world-editor-zoom"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => pickAt(e.nativeEvent.locationY)}
        onResponderMove={(e) => pickAt(e.nativeEvent.locationY)}
      >
        <View pointerEvents="none" style={styles.zoomBar} />
        <View pointerEvents="none" style={[styles.zoomThumb, { top: (1 - zoom) * length - ZOOM_THUMB / 2 }]} />
      </View>
      <Ionicons name="remove" size={16} color={hud.primary} accessibilityElementsHidden importantForAccessibility="no" />
    </View>
  );
};

/** On the web, a drag on the preview mustn't scroll the page or select text. */
const noBrowserGestures = (Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : {}) as unknown as ViewStyle;

const Swatches = ({
  colours,
  value,
  onPick,
  label,
  order,
  firstIcon,
  firstLabel,
  custom = false,
}: {
  colours: readonly string[];
  value: number;
  onPick: (index: number) => void;
  label: string;
  order?: readonly number[];
  /** An icon on the first swatch, when it means something other than its colour. */
  firstIcon?: keyof typeof Ionicons.glyphMap;
  firstLabel?: string;
  /**
   * A last swatch for any colour, with a picker under the row while it's
   * chosen. The value is then a custom colour (see customColour).
   */
  custom?: boolean;
}) => {
  const t = useAppTheme();
  const shown = order ?? colours.map((_, i) => i);
  const id = label.toLowerCase().replace(" ", "-");
  const rgb = custom ? customRgb(value) : null;
  const pickCustom = () => {
    if (rgb !== null) return;
    // Start the picker from the colour worn now.
    onPick(customColour(hexRgb(colours[value] ?? colours[0])));
  };
  const swatches = (
    <View style={styles.wrap}>
      {shown.map((i, place) => (
        <Pressable
          key={`${label}${i}`}
          onPress={() => onPick(i)}
          accessibilityRole="radio"
          accessibilityState={{ selected: i === value }}
          accessibilityLabel={i === 0 && firstLabel ? firstLabel : `${label} ${place + 1}`}
          testID={`world-editor-${label.toLowerCase().replace(" ", "-")}-${i}`}
          style={[styles.swatch, { backgroundColor: colours[i] }, i === value && [styles.swatchOn, { borderColor: t.text }]]}
        >
          {i === 0 && firstIcon ? <Ionicons name={firstIcon} size={16} color={hud.cream} style={styles.swatchIcon} /> : null}
        </Pressable>
      ))}
      {custom ? (
        <Pressable
          onPress={pickCustom}
          accessibilityRole="radio"
          accessibilityState={{ selected: rgb !== null }}
          accessibilityLabel={`${label}: any colour`}
          testID={`world-editor-${id}-custom`}
          style={[styles.swatch, styles.customSwatch, { backgroundColor: rgb !== null ? rgbHex(rgb) : hud.cream }, rgb !== null && [styles.swatchOn, { borderColor: t.text }]]}
        >
          <Ionicons name="color-palette" size={18} color={rgb !== null && !isLight(rgbHex(rgb)) ? hud.cream : hud.forest} style={styles.swatchIcon} />
        </Pressable>
      ) : null}
    </View>
  );
  if (rgb === null) return swatches;
  return (
    <>
      {swatches}
      <ColourPicker rgb={rgb} onPick={(next) => onPick(customColour(next))} label={label} />
    </>
  );
};

const SKINS_LIGHT_TO_DARK = lightToDark(people.skins);

const TILE = 68;
const TILE_INK = 5;
const TILE_GAP = 8;
const MIN_COLUMNS = 4;

const tileFor = (width: number) => {
  if (width <= 0) return TILE + TILE_INK;
  const columns = Math.max(MIN_COLUMNS, Math.floor((width + TILE_GAP) / (TILE + TILE_INK + 16 + TILE_GAP)));
  return Math.floor((width - TILE_GAP * (columns - 1)) / columns);
};
const FRAMES = {
  face: { s: 62, headAt: 0.54, heading: 0 },
  hair: { s: 46, headAt: 0.6, heading: 0.4 },
  hat: { s: 40, headAt: 0.66, heading: 0 },
  body: { s: 46, headAt: 0.36, heading: -0.6 },
  outfit: { s: 50, headAt: 0.3, heading: 0 },
  /** Close on the face, for small things: moles, freckles, makeup. */
  zoom: { s: 95, headAt: 0.4, heading: 0 },
} as const;
type Framing = keyof typeof FRAMES;

const mannequin = (draft: Look): Look => ({
  v: LOOK_VERSION,
  skin: draft.skin,
  hair: HAIR_STYLES.indexOf("Bald"),
  hairColour: draft.hairColour,
  shirt: draft.shirt,
  eyeColour: lookPart(draft, "eyeColour"),
  hat: 0,
  accessory: 0,
  face: 0,
  eyes: 0,
  brows: 0,
  nose: 0,
  mouth: 0,
  height: 2,
  build: 2,
  freckles: 0,
  blush: 0,
  beard: 0,
  outfit: 0,
  pants: lookPart(draft, "pants"),
  // Kept as they are, so a custom colour shows on the choices too.
  pantsColour: draft.pantsColour,
  browColour: lookPart(draft, "browColour"),
  favourite: draft.favourite,
  sleeves: lookPart(draft, "sleeves"),
});

const STILL = { x: 0, z: 0, walking: false, arrivesAt: 0 };

const Choices = memo(function Choices({
  names,
  part,
  framing,
  value,
  blank,
  onPick,
  testID,
  tile,
  hidden = [],
}: {
  names: readonly string[];
  part: LookPart;
  framing: Framing;
  value: number;
  blank: Look;
  onPick: (part: LookPart, index: number) => void;
  testID: string;
  tile: number;
  hidden?: readonly number[];
}) {
  const t = useAppTheme();
  const frame = FRAMES[framing];
  const stage = tile - TILE_INK;
  const s = frame.s * (stage / TILE);
  const up = s * 0.86;
  const foot = { x: stage / 2, y: stage * frame.headAt + bodyScale(blank).height * up, depth: 1, scale: s };
  return (
    <View style={styles.wrap}>
      {names.map((name, i) => hidden.includes(i) ? null : (
        <Pressable
          key={name}
          onPress={() => onPick(part, i)}
          accessibilityRole="radio"
          accessibilityState={{ selected: i === value }}
          accessibilityLabel={name}
          testID={`${testID}-${i}`}
          style={({ pressed }) => [styles.tile, { width: tile, height: tile, borderColor: i === value ? t.text : hud.primarySoft }, pressed && styles.tilePressed]}
        >
          <View style={{ width: stage, height: stage, overflow: "hidden" }} pointerEvents="none">
            <Avatar
              figure={{ foot, s, up, bob: 0 }}
              pose={{ ...STILL, heading: frame.heading }}
              look={{ ...blank, [part]: i }}
              t={0}
              seed={0}
              shadow={false}
            />
          </View>
          {i === value ? (
            <View style={styles.tileTick}>
              <Ionicons name="checkmark" size={12} color={hud.onAccent} />
            </View>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
});

/** The step slider's thumb, and how far the track sits in from each end so the thumb never covers the end labels. */
const STEP_THUMB = 26;
/** Tall enough to take a finger anywhere on the thumb or around the line, and as tall as the row was. */
const STEP_HEIGHT = 34;

/**
 * A step slider: drag the thumb or tap a step. Its whole row between the end
 * labels takes the touch, so a press on the thumb or just off the line drags
 * it, and the choices under it don't scroll while you drag.
 */
const Steps = ({
  value,
  count,
  onPick,
  label,
  low,
  high,
  testID,
}: {
  value: number;
  count: number;
  onPick: (v: number) => void;
  label: string;
  low: string;
  high: string;
  testID?: string;
}) => {
  const t = useAppTheme();
  const holdScroll = useContext(HoldScroll);
  // The track's width: the slider less half a thumb each end.
  const [width, setWidth] = useState(0);
  // Where the track starts on the page, from the press that began the drag.
  // A finger that strays off the slider keeps its place along it.
  const trackLeft = useRef(0);
  const pickAt = (pageX: number) => {
    if (width <= 0) return;
    const next = Math.max(0, Math.min(count - 1, Math.round(((pageX - trackLeft.current) / width) * (count - 1))));
    if (next !== value) onPick(next);
  };
  const onGrant = (e: GestureResponderEvent) => {
    trackLeft.current = e.nativeEvent.pageX - e.nativeEvent.locationX + STEP_THUMB / 2;
    holdScroll(true);
    pickAt(e.nativeEvent.pageX);
    // Asks Android's native scroll view not to take the touch.
    return true;
  };
  const at = (value / (count - 1)) * width;
  const step = (by: number) => onPick(Math.max(0, Math.min(count - 1, value + by)));
  // On the web the track is a tab stop, and the arrow keys (Home and End too)
  // move it a step at a time, as a slider does.
  const keys =
    Platform.OS === "web"
      ? ({
          tabIndex: 0,
          onKeyDown: (e: { key: string; preventDefault: () => void }) => {
            const by = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, Home: -count, End: count }[e.key];
            if (by === undefined) return;
            e.preventDefault();
            step(by);
          },
        } as object)
      : {};
  return (
    <View style={styles.stepsRow}>
      <Text style={[typography.caption, styles.edge, { color: t.muted }]}>{low}</Text>
      <View
        style={[styles.steps, noBrowserGestures]}
        // The slider is the target of every touch on it, never the thumb or a
        // stop, so locationX is always from its own left edge.
        pointerEvents="box-only"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width - STEP_THUMB)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        // The web reads the aria- props, not accessibilityValue.
        accessibilityValue={{ min: 1, max: count, now: value + 1 }}
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={value + 1}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 1 : -1)}
        {...keys}
        testID={testID ?? `world-editor-${label.toLowerCase()}`}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={(e) => pickAt(e.nativeEvent.pageX)}
        onResponderRelease={() => holdScroll(false)}
        onResponderTerminate={() => holdScroll(false)}
      >
        <View style={[styles.track, { backgroundColor: hud.primarySoft }]}>
          {Array.from({ length: count }, (_, i) => (
            <View key={`step${i}`} style={[styles.stop, { left: (i / (count - 1)) * width - 3 }]} />
          ))}
          <View style={[styles.thumb, { left: at - STEP_THUMB / 2 }]} />
        </View>
      </View>
      <Text style={[typography.caption, styles.edge, styles.edgeHigh, { color: t.muted }]}>{high}</Text>
    </View>
  );
};

/**
 * Stops the choices scrolling while a slider in them is dragged. On iOS the
 * scroll view otherwise takes a drag that moves up or down a little and ends
 * it. The web needs none of this: the slider's touch-action keeps the page
 * still, and turning the scroll off there would hide its scroll bar and
 * change the slider's width mid-drag.
 */
const HoldScroll = createContext<(holding: boolean) => void>(() => {});

const ChoicesScroll = ({ children, ...props }: ComponentProps<typeof SharpScrollView>) => {
  const [holding, setHolding] = useState(false);
  const hold = useCallback((next: boolean) => setHolding(Platform.OS !== "web" && next), []);
  return (
    <HoldScroll.Provider value={hold}>
      <SharpScrollView {...props} scrollEnabled={!holding}>
        {children}
      </SharpScrollView>
    </HoldScroll.Provider>
  );
};

/** The placement sliders for one part, Mii-style. */
const NUDGE_ROWS = {
  Eyes: [
    { part: "eyeY", name: "Up/down", low: "Low", high: "High" },
    { part: "eyeGap", name: "Spacing", low: "Close", high: "Apart" },
    { part: "eyeSize", name: "Size", low: "Small", high: "Big" },
    { part: "eyeTilt", name: "Tilt", low: "Down", high: "Up" },
  ],
  Brows: [
    { part: "browY", name: "Up/down", low: "Low", high: "High" },
    { part: "browGap", name: "Spacing", low: "Close", high: "Apart" },
    { part: "browSize", name: "Size", low: "Small", high: "Big" },
    { part: "browTilt", name: "Tilt", low: "Down", high: "Up" },
  ],
  Mouth: [
    { part: "mouthY", name: "Up/down", low: "Low", high: "High" },
    { part: "mouthSize", name: "Size", low: "Small", high: "Big" },
    { part: "mouthTilt", name: "Tilt", low: "Left", high: "Right" },
  ],
} as const satisfies Record<string, readonly { part: NudgePart; name: string; low: string; high: string }[]>;

/** Two rows of four: the face's parts, then everything else. */
const TABS = ["Face", "Eyes", "Brows", "Mouth", "Hair", "Body", "Outfit", "Extras"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Partial<Record<Tab, string>> = { Hair: "Hair & hat" };
/** Each tab's camera: close on the part it changes. */
const SHOTS: Record<Tab, Shot> = { Face: "face", Eyes: "eyes", Brows: "brows", Mouth: "mouth", Hair: "head", Body: "full", Outfit: "outfit", Extras: "extras" };

/** Glasses were one of the extras; the editor keeps them as their own part. */
const withOwnGlasses = (look: Look): Look =>
  look.accessory === OLD_GLASSES ? { ...look, accessory: 0, glasses: lookPart(look, "glasses") } : look;

/**
 * Choose your character, Mii-style, in tabs: face (skin, shape, nose, blush,
 * freckles, a mole), eyes, brows and mouth (each with sliders to move, size
 * and tilt it), hair, body (height, build, favourite colour), outfit (top and
 * bottoms) and extras. Nothing is sent while you browse; Save sends the look
 * once.
 */
export const CharacterEditor = ({
  visible,
  look,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** The look you have now: your saved one, or the one picked from your email. */
  look: Look;
  /** Saves the look; the garden reports a failure, the editor doesn't wait. */
  onSave: (look: Look) => Promise<unknown>;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const short = screenHeight < SHORT_SCREEN;
  const sideBySide = short && screenWidth >= SIDE_BY_SIDE_WIDTH;
  const previewHeight = short ? SHORT_PREVIEW : Math.round(Math.min(MAX_PREVIEW, Math.max(BASE_PREVIEW, screenHeight * 0.3)));
  const [sideHeight, setSideHeight] = useState(0);
  const [choicesWidth, setChoicesWidth] = useState(0);
  const tile = tileFor(choicesWidth);
  const [draft, setDraft] = useState<Look>(() => withOwnGlasses(look));
  const [tab, setTab] = useState<Tab>("Face");
  const shot = SHOTS[tab];
  const [confirmingRandom, setConfirmingRandom] = useState(false);
  // Start from your current look each time the editor opens, so a cancelled
  // change doesn't come back.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(withOwnGlasses(look));
    } else {
      setConfirmingRandom(false);
    }
  }
  const set = (name: LookPart) => (value: number) => setDraft((d) => ({ ...d, [name]: value }));
  const pickPart = useCallback((name: LookPart, value: number) => {
    setDraft((d) => ({ ...d, [name]: value }));
  }, []);
  const part = (name: LookPart) => lookPart(draft, name);
  const blankSkin = draft.skin;
  const blankHairColour = draft.hairColour;
  const blankShirt = draft.shirt;
  const blankEyeColour = lookPart(draft, "eyeColour");
  const blankPants = lookPart(draft, "pants");
  const blankPantsColour = draft.pantsColour;
  const blankBrowColour = lookPart(draft, "browColour");
  const blankFavourite = draft.favourite;
  const blankSleeves = lookPart(draft, "sleeves");
  const outfit = lookPart(draft, "outfit");
  const blank = useMemo(
    () =>
      mannequin({
        skin: blankSkin,
        hair: 0,
        hairColour: blankHairColour,
        shirt: blankShirt,
        eyeColour: blankEyeColour,
        pants: blankPants,
        pantsColour: blankPantsColour,
        browColour: blankBrowColour,
        favourite: blankFavourite,
        sleeves: blankSleeves,
      }),
    [blankSkin, blankHairColour, blankShirt, blankEyeColour, blankPants, blankPantsColour, blankBrowColour, blankFavourite, blankSleeves]
  );
  // The sleeves' choices, on the top you're wearing.
  const sleevesBlank = useMemo(() => ({ ...blank, outfit }), [blank, outfit]);
  const choiceBlank = useDeferredValue(blank);
  const choiceSleevesBlank = useDeferredValue(sleevesBlank);
  const section = (title: string) => <Text style={[typography.label, { color: t.muted }]}>{title}</Text>;
  const nudges = (group: keyof typeof NUDGE_ROWS) => (
    <>
      <View style={styles.sectionRow}>
        {section("Position and size")}
        <Pressable
          onPress={() => setDraft((d) => ({ ...d, ...Object.fromEntries(NUDGE_ROWS[group].map((row) => [row.part, NUDGES_RESET[row.part]])) }))}
          accessibilityRole="button"
          accessibilityLabel={`Reset ${group.toLowerCase()} position and size`}
          testID={`world-editor-reset-${group.toLowerCase()}`}
          hitSlop={8}
        >
          <Text style={[typography.label, { color: hud.accent }]}>Reset</Text>
        </Pressable>
      </View>
      {NUDGE_ROWS[group].map((row) => (
        <View key={row.part} style={styles.nudgeRow}>
          <Text style={[typography.caption, styles.nudgeName, { color: t.text }]}>{row.name}</Text>
          <View style={styles.grow}>
            <Steps
              value={part(row.part)}
              count={LOOK_SIZES[row.part]}
              onPick={set(row.part)}
              label={`${group} ${row.name.toLowerCase()}`}
              low={row.low}
              high={row.high}
              testID={`world-editor-${row.part}`}
            />
          </View>
        </View>
      ))}
    </>
  );
  const fullOutfit = FULL_OUTFITS.includes(outfit);
  // The new look shows at once (an optimistic update) and the editor closes
  // straight away; if the save fails, the garden says so and puts the old
  // look back.
  const save = () => {
    void onSave({ ...draft, v: LOOK_VERSION });
    onClose();
  };
  const tabs = (
    <View style={styles.tabs} accessibilityRole="tablist">
      {TABS.map((name) => (
        <Pressable
          key={name}
          onPress={() => setTab(name)}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === name }}
          testID={`world-editor-tab-${name.toLowerCase()}`}
          style={[styles.tab, tab === name && { backgroundColor: hud.primary }]}
        >
          <Text style={[typography.label, { color: tab === name ? hud.cream : hud.forest }]} numberOfLines={1}>
            {TAB_LABELS[name] ?? name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  const choices = (
    <ChoicesScroll
      style={styles.grow}
      contentContainerStyle={styles.stack}
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      onLayout={(e) => setChoicesWidth(e.nativeEvent.layout.width)}
    >
      {tab === "Face" ? (
        <>
          {section("Skin")}
          <Swatches colours={people.skins} value={draft.skin} onPick={set("skin")} label="Skin" order={SKINS_LIGHT_TO_DARK} />
          {section("Face shape")}
          <Choices names={FACES} part="face" framing="face" value={part("face")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-face" />
          {section("Nose")}
          <Choices names={NOSES} part="nose" framing="face" value={part("nose")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-nose" />
          {section("Blush")}
          <Choices names={BLUSH} part="blush" framing="face" value={part("blush")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-blush" />
          {section("Freckles")}
          <Choices names={FRECKLES} part="freckles" framing="zoom" value={part("freckles")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-freckles" />
          {section("Mole")}
          <Choices names={MOLES} part="mole" framing="zoom" value={part("mole")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-mole" />
        </>
      ) : null}
      {tab === "Eyes" ? (
        <>
          {section("Eyes")}
          <Choices names={EYES} part="eyes" framing="face" value={part("eyes")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-eyes" />
          {section("Eye colour")}
          <Swatches colours={people.eyeColours} value={part("eyeColour")} onPick={set("eyeColour")} label="Eye colour" />
          {nudges("Eyes")}
          {section("Eyeshadow")}
          <Choices names={EYESHADOW} part="eyeshadow" framing="zoom" value={part("eyeshadow")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-eyeshadow" />
          {section("Glasses")}
          <Choices names={GLASSES} part="glasses" framing="face" value={part("glasses")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-glasses" />
        </>
      ) : null}
      {tab === "Brows" ? (
        <>
          {section("Eyebrows")}
          <Choices names={BROWS} part="brows" framing="face" value={part("brows")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-brows" />
          {section("Brow colour")}
          <Swatches
            colours={[shade(people.hairColours[draft.hairColour] ?? people.hairColours[0], -0.3), ...people.hairColours.map((c) => shade(c, -0.3))]}
            value={part("browColour")}
            onPick={set("browColour")}
            label="Brow colour"
            firstIcon="link"
            firstLabel="Brow colour: match hair colour"
          />
          <Text style={[typography.caption, { color: t.muted }]}>The first one matches your hair. Brows move with your eyes.</Text>
          {nudges("Brows")}
        </>
      ) : null}
      {tab === "Mouth" ? (
        <>
          {section("Mouth")}
          <Choices names={MOUTHS} part="mouth" framing="face" value={part("mouth")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-mouth" />
          {nudges("Mouth")}
          {section("Lipstick")}
          <Choices names={LIPSTICK} part="lipstick" framing="zoom" value={part("lipstick")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-lipstick" />
          {section("Facial hair")}
          <Choices names={BEARDS} part="beard" framing="face" value={part("beard")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-beard" />
        </>
      ) : null}
      {tab === "Hair" ? (
        <>
          {section("Hairstyle")}
          <Choices names={HAIR_STYLES} part="hair" framing="hair" value={part("hair")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-hair" />
          {section("Hair colour")}
          <Swatches colours={people.hairColours} value={draft.hairColour} onPick={set("hairColour")} label="Hair colour" />
          {section("Hat")}
          <Choices names={HATS} part="hat" framing="hat" value={part("hat")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-hat" />
        </>
      ) : null}
      {tab === "Body" ? (
        <>
          {section("Height")}
          <Steps value={part("height")} count={LOOK_SIZES.height} onPick={set("height")} label="Height" low="Short" high="Tall" />
          {section("Build")}
          <Steps value={part("build")} count={LOOK_SIZES.build} onPick={set("build")} label="Build" low="Slim" high="Broad" />
          <Text style={[typography.caption, { color: t.muted }]}>
            Only how you look: everyone walks, stands and hears the same.
          </Text>
          {section("Favourite colour")}
          <Swatches colours={people.favourites} value={draft.favourite ?? 0} onPick={set("favourite")} label="Favourite colour" custom />
          <Text style={[typography.caption, { color: t.muted }]}>You wear it as your shoes, and on a beret, bow, headband or party hat.</Text>
          {section("Background")}
          <Swatches colours={people.backdrops} value={part("backdrop")} onPick={set("backdrop")} label="Background" />
          <Text style={[typography.caption, { color: t.muted }]}>The circle behind you in the People list and on invites.</Text>
        </>
      ) : null}
      {tab === "Outfit" ? (
        <>
          {section("Top")}
          <Choices names={OUTFITS} part="outfit" framing="outfit" value={outfit} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-outfit" />
          {section("Sleeves")}
          {SLEEVELESS.includes(outfit) ? (
            <Text style={[typography.caption, { color: t.muted }]}>The tanks, sundress and hoodie have no sleeves choice.</Text>
          ) : (
            <Choices names={SLEEVES} part="sleeves" framing="outfit" value={part("sleeves")} blank={choiceSleevesBlank} onPick={pickPart} tile={tile} testID="world-editor-sleeves" />
          )}
          {section("Colour")}
          <Swatches colours={people.shirts} value={draft.shirt} onPick={set("shirt")} label="Shirt" custom />
          {section("Bottoms")}
          {fullOutfit ? (
            <Text style={[typography.caption, { color: t.muted }]}>A dress, skirt, overalls, sundress or jumpsuit comes with its own bottoms.</Text>
          ) : (
            <>
              <Choices names={PANTS} part="pants" framing="outfit" value={part("pants")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-pants" />
              {section("Bottoms colour")}
              <Swatches colours={people.pants} value={draft.pantsColour ?? 0} onPick={set("pantsColour")} label="Bottoms colour" custom />
            </>
          )}
        </>
      ) : null}
      {tab === "Extras" ? (
        <>
          {section("Extra")}
          <Choices names={ACCESSORIES} part="accessory" framing="body" value={part("accessory")} blank={choiceBlank} onPick={pickPart} tile={tile} testID="world-editor-extra" hidden={[OLD_GLASSES]} />
        </>
      ) : null}
    </ChoicesScroll>
  );
  const footer = (
    <View style={styles.footer}>
      <View style={styles.buttons}>
        <View style={styles.grow}>
          <Btn title="Randomise" icon="shuffle" variant="tonal" onPress={() => setConfirmingRandom(true)} />
        </View>
        <View style={styles.grow}>
          <Btn title="Save" icon="checkmark" onPress={save} />
        </View>
      </View>
      {short ? null : <Text style={[typography.caption, { color: t.muted }]}>Everyone sees your new look when you save.</Text>}
    </View>
  );
  return (
    <FastModal visible={visible} onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={[styles.column, sideBySide && { maxWidth: WIDE_COLUMN }]} testID="world-editor">
          <View style={styles.header}>
            <Text style={[typography.headline, styles.grow, { color: t.text }]} accessibilityRole="header">
              Your character
            </Text>
            <Pressable
              hitSlop={8}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close without saving"
              testID="world-editor-close"
              style={({ pressed }) => [styles.close, { backgroundColor: t.ghost }, pressed && styles.tilePressed]}
            >
              <Ionicons name="close" size={20} color={t.ghostText} />
            </Pressable>
          </View>
          {sideBySide ? (
            <View style={styles.sideBySide}>
              <View style={styles.side}>
                <View style={styles.grow} onLayout={(e) => setSideHeight(e.nativeEvent.layout.height)}>
                  {sideHeight > 0 ? <Preview look={draft} active={visible} height={sideHeight} shot={shot} /> : null}
                </View>
                {footer}
              </View>
              <View style={styles.pane}>
                {tabs}
                {choices}
              </View>
            </View>
          ) : (
            <>
              <Preview look={draft} active={visible} height={previewHeight} shot={shot} />
              {tabs}
              {choices}
              {footer}
            </>
          )}
        </View>
      </View>
      <ConfirmDialog
        visible={confirmingRandom}
        title="Randomise your character?"
        message="This replaces your current look. You can still cancel before saving."
        confirmLabel="Randomise"
        destructive={false}
        onConfirm={() => setDraft(randomLook())}
        onClose={() => setConfirmingRandom(false)}
      />
    </FastModal>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, paddingBottom: spacing.sm },
  screen: { flex: 1, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: COLUMN_WIDTH, paddingHorizontal: spacing.lg, gap: spacing.sm },
  sideBySide: { flex: 1, flexDirection: "row", gap: spacing.md },
  side: { width: "40%", gap: spacing.sm },
  pane: { flex: 1, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  // Four to a row.
  tab: { flexGrow: 1, flexBasis: "22%", alignItems: "center", paddingHorizontal: 4, paddingVertical: 8, borderRadius: 999, backgroundColor: hud.primarySoft },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  nudgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  nudgeName: { width: 58 },
  // The same width each end, so every slider's track lines up.
  edge: { width: 42 },
  edgeHigh: { textAlign: "right" },
  swatchIcon: { textAlign: "center", lineHeight: 30 },
  stepsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  steps: { flex: 1, height: STEP_HEIGHT, justifyContent: "center", paddingHorizontal: STEP_THUMB / 2 },
  track: { height: 8, borderRadius: 4, justifyContent: "center" },
  stop: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: hud.cream },
  thumb: { position: "absolute", width: STEP_THUMB, height: STEP_THUMB, borderRadius: STEP_THUMB / 2, backgroundColor: hud.accent, borderWidth: 2.5, borderColor: hud.forest },
  footer: { gap: spacing.sm, paddingTop: spacing.sm },
  preview: { borderRadius: 18, overflow: "hidden" },
  zoom: {
    position: "absolute",
    right: 6,
    top: 6,
    bottom: 6,
    width: 34,
    alignItems: "center",
    paddingVertical: 4,
    borderRadius: 17,
    backgroundColor: hud.nameBg,
  },
  zoomTrack: { flex: 1, alignSelf: "stretch", alignItems: "center", marginVertical: ZOOM_THUMB / 2 },
  zoomBar: { flex: 1, width: 6, borderRadius: 3, backgroundColor: hud.primarySoft },
  zoomThumb: {
    position: "absolute",
    width: ZOOM_THUMB,
    height: ZOOM_THUMB,
    borderRadius: ZOOM_THUMB / 2,
    backgroundColor: hud.accent,
    borderWidth: 2.5,
    borderColor: hud.forest,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: hud.primarySoft },
  swatchOn: { borderWidth: 3.5 },
  customSwatch: { borderStyle: "dashed", borderColor: hud.forest },
  tile: { borderRadius: 16, borderWidth: 2.5, overflow: "hidden", backgroundColor: hud.primarySoft },
  tilePressed: { opacity: 0.75 },
  tileTick: {
    position: "absolute",
    right: 3,
    top: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: hud.accent,
  },
  buttons: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
});
