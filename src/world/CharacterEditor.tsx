import { Btn, FastModal } from "@/components/ui";
import Ionicons from "@expo/vector-icons/Ionicons";
import { spacing, typography, useAppTheme } from "@/theme";
import {
  ACCESSORIES,
  BEARDS,
  BLUSH,
  bodyScale,
  BROWS,
  EYES,
  FACES,
  HAIR_STYLES,
  HATS,
  OUTFITS,
  LOOK_SIZES,
  LOOK_VERSION,
  lookPart,
  MOUTHS,
  NOSES,
  ON_OFF,
  randomLook,
  type Look,
  type LookPart,
} from "@shared/world";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { garden, hud, lightToDark, people } from "./palette";
import { Avatar, figureTop } from "./Person";
import { Ellipse } from "./Shapes";

const BASE_PREVIEW = 148;
const MAX_PREVIEW = 300;
const COLUMN_WIDTH = 560;

/** Turns per pixel dragged (radians). */
const TURN_PER_PX = 0.012;
/** The slow turn on its own (radians a second). */
const AUTO_TURN = 0.6;
const AUTO_START_MS = 3000;
/** How quickly a flick's spin dies away (per second). */
const SPIN_DECAY = 3;
/** The fastest a flick can spin it (radians a second). */
const MAX_SPIN = 12;

/**
 * The character on a patch of lawn. It turns slowly on its own; swipe (or
 * drag with a mouse) to turn it by hand, with a little momentum when you let
 * go. The swipe stays on the preview: it doesn't scroll the list or close the
 * sheet. All on this phone; nothing is sent.
 */
const Preview = ({ look, active, height }: { look: Look; active: boolean; height: number }) => {
  const [width, setWidth] = useState(0);
  const [frame, setFrame] = useState({ heading: 0, t: 0 });
  const spin = useRef({ down: false, lastX: 0, lastAt: 0, velocity: 0, heading: 0, openedAt: 0, touched: false });
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const start = Date.now();
    let prev = start;
    // Each opening starts facing you, and only turns by itself after a moment.
    spin.current = { down: false, lastX: 0, lastAt: start, velocity: 0, heading: 0, openedAt: start, touched: false };
    const tick = () => {
      const now = Date.now();
      const dt = (now - prev) / 1000;
      prev = now;
      const d = spin.current;
      if (!d.down) {
        if (Math.abs(d.velocity) > 0.05) {
          d.heading += d.velocity * dt;
          d.velocity *= Math.exp(-SPIN_DECAY * dt);
        } else if (!d.touched && now - d.openedAt > AUTO_START_MS) d.heading += AUTO_TURN * dt;
      }
      setFrame({ heading: d.heading, t: (now - start) / 1000 });
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [active]);
  const onGrant = (e: GestureResponderEvent) => {
    const d = spin.current;
    d.down = true;
    d.lastX = e.nativeEvent.pageX;
    d.lastAt = Date.now();
    d.velocity = 0;
    d.touched = true;
  };
  const onMove = (e: GestureResponderEvent) => {
    const d = spin.current;
    const now = Date.now();
    const dx = e.nativeEvent.pageX - d.lastX;
    d.heading += dx * TURN_PER_PX;
    const dt = Math.max(1, now - d.lastAt) / 1000;
    const v = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, (dx * TURN_PER_PX) / dt));
    d.velocity = d.velocity * 0.6 + v * 0.4;
    d.lastX = e.nativeEvent.pageX;
    d.lastAt = now;
  };
  const onEnd = () => {
    const d = spin.current;
    d.down = false;
    // A finger that stopped before lifting leaves no spin.
    if (Date.now() - d.lastAt > 80) d.velocity = 0;
  };
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // Full size, unless the tallest looks (a tall afro, say) would poke out of
  // the top: then just small enough to fit.
  const zoom = height / BASE_PREVIEW;
  const footY = height - 28 * zoom;
  const s = Math.min(100 * zoom, (footY - 6) / figureTop(look, 0.86));
  const foot = { x: width / 2, y: footY, depth: 1, scale: s };
  return (
    <View
      style={[styles.preview, { height, backgroundColor: garden.sky }, noBrowserGestures]}
      onLayout={onLayout}
      testID="world-editor-preview"
      accessible
      accessibilityLabel="Your character. Swipe left or right to turn it."
      onStartShouldSetResponder={() => true}
      // Capture moves too, so a swipe here never scrolls the choices or the sheet.
      onMoveShouldSetResponderCapture={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={onGrant}
      onResponderMove={onMove}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Ellipse cx={width / 2} cy={height - 26 * zoom} rx={Math.min(width * 0.42, 150 * zoom)} ry={34 * zoom} fill={garden.lawn} />
        {width > 0 ? (
          <Avatar
            figure={{ foot, s, up: s * 0.86, bob: 0 }}
            pose={{ x: 0, z: 0, walking: false, heading: frame.heading, arrivesAt: 0 }}
            look={look}
            t={frame.t}
            seed={0}
          />
        ) : null}
      </View>
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
}: {
  colours: readonly string[];
  value: number;
  onPick: (index: number) => void;
  label: string;
  order?: readonly number[];
}) => {
  const t = useAppTheme();
  const shown = order ?? colours.map((_, i) => i);
  return (
    <View style={styles.wrap}>
      {shown.map((i, place) => (
        <Pressable
          key={colours[i]}
          onPress={() => onPick(i)}
          accessibilityRole="radio"
          accessibilityState={{ selected: i === value }}
          accessibilityLabel={`${label} ${place + 1}`}
          testID={`world-editor-${label.toLowerCase().replace(" ", "-")}-${i}`}
          style={[styles.swatch, { backgroundColor: colours[i] }, i === value && [styles.swatchOn, { borderColor: t.text }]]}
        />
      ))}
    </View>
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
});

const STILL = { x: 0, z: 0, walking: false, arrivesAt: 0 };

const Choices = ({
  names,
  part,
  framing,
  draft,
  onPick,
  testID,
  tile,
}: {
  names: readonly string[];
  part: LookPart;
  framing: Framing;
  draft: Look;
  onPick: (index: number) => void;
  testID: string;
  tile: number;
}) => {
  const t = useAppTheme();
  const value = lookPart(draft, part);
  const blank = mannequin(draft);
  const frame = FRAMES[framing];
  const stage = tile - TILE_INK;
  const s = frame.s * (stage / TILE);
  const up = s * 0.86;
  const foot = { x: stage / 2, y: stage * frame.headAt + bodyScale(blank).height * up, depth: 1, scale: s };
  return (
    <View style={styles.wrap}>
      {names.map((name, i) => (
        <Pressable
          key={name}
          onPress={() => onPick(i)}
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
};

/**
 * A step slider: drag the thumb or tap a step. Takes the touch so a drag here
 * doesn't scroll the choices.
 */
const Steps = ({ value, count, onPick, label, low, high }: { value: number; count: number; onPick: (v: number) => void; label: string; low: string; high: string }) => {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const pickAt = (x: number) => {
    if (width <= 0) return;
    onPick(Math.max(0, Math.min(count - 1, Math.round((x / width) * (count - 1)))));
  };
  const at = (value / (count - 1)) * width;
  return (
    <View style={styles.stepsRow}>
      <Text style={[typography.caption, { color: t.muted }]}>{low}</Text>
      <View
        style={[styles.track, { backgroundColor: hud.primarySoft }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 1, max: count, now: value + 1 }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => onPick(Math.max(0, Math.min(count - 1, value + (e.nativeEvent.actionName === "increment" ? 1 : -1))))}
        testID={`world-editor-${label.toLowerCase()}`}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponderCapture={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => pickAt(e.nativeEvent.locationX)}
        onResponderMove={(e) => pickAt(e.nativeEvent.locationX)}
      >
        {Array.from({ length: count }, (_, i) => (
          <View key={`step${i}`} pointerEvents="none" style={[styles.stop, { left: (i / (count - 1)) * width - 3 }]} />
        ))}
        <View pointerEvents="none" style={[styles.thumb, { left: at - 13 }]} />
      </View>
      <Text style={[typography.caption, { color: t.muted }]}>{high}</Text>
    </View>
  );
};

const TABS = ["Face", "Hair", "Body", "Outfit", "Extras"] as const;
type Tab = (typeof TABS)[number];

/**
 * Choose your character, Mii-style, in tabs: face (shape, eyes, brows, nose,
 * mouth), hair, body (height and build), outfit and extras. Nothing is sent
 * while you browse; Save sends the look once.
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
  const { height: screenHeight } = useWindowDimensions();
  const previewHeight = Math.round(Math.min(MAX_PREVIEW, Math.max(BASE_PREVIEW, screenHeight * 0.3)));
  const [choicesWidth, setChoicesWidth] = useState(0);
  const tile = tileFor(choicesWidth);
  const [draft, setDraft] = useState<Look>(look);
  const [tab, setTab] = useState<Tab>("Face");
  // Start from your current look each time the editor opens, so a cancelled
  // change doesn't come back.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(look);
    }
  }
  const set = (name: LookPart) => (value: number) => setDraft((d) => ({ ...d, [name]: value }));
  const part = (name: LookPart) => lookPart(draft, name);
  // The new look shows at once (an optimistic update) and the editor closes
  // straight away; if the save fails, the garden says so and puts the old
  // look back.
  const save = () => {
    void onSave({ ...draft, v: LOOK_VERSION });
    onClose();
  };
  const section = (title: string) => <Text style={[typography.label, { color: t.muted }]}>{title}</Text>;
  return (
    <FastModal visible={visible} onRequestClose={onClose}>
      <View style={[styles.screen, { backgroundColor: t.background, paddingTop: insets.top + spacing.sm, paddingBottom: insets.bottom + spacing.sm }]}>
        <View style={styles.column} testID="world-editor">
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
          <Preview look={draft} active={visible} height={previewHeight} />
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
                  {name}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            style={styles.grow}
            contentContainerStyle={styles.stack}
            onLayout={(e) => setChoicesWidth(e.nativeEvent.layout.width)}
          >
        {tab === "Face" ? (
          <>
            {section("Skin")}
            <Swatches colours={people.skins} value={draft.skin} onPick={set("skin")} label="Skin" order={SKINS_LIGHT_TO_DARK} />
            {section("Face shape")}
            <Choices names={FACES} part="face" framing="face" draft={draft} onPick={set("face")} tile={tile} testID="world-editor-face" />
            {section("Eyes")}
            <Choices names={EYES} part="eyes" framing="face" draft={draft} onPick={set("eyes")} tile={tile} testID="world-editor-eyes" />
            {section("Eye colour")}
            <Swatches colours={people.eyeColours} value={part("eyeColour")} onPick={set("eyeColour")} label="Eye colour" />
            {section("Eyebrows")}
            <Choices names={BROWS} part="brows" framing="face" draft={draft} onPick={set("brows")} tile={tile} testID="world-editor-brows" />
            {section("Nose")}
            <Choices names={NOSES} part="nose" framing="face" draft={draft} onPick={set("nose")} tile={tile} testID="world-editor-nose" />
            {section("Mouth")}
            <Choices names={MOUTHS} part="mouth" framing="face" draft={draft} onPick={set("mouth")} tile={tile} testID="world-editor-mouth" />
          </>
        ) : null}
        {tab === "Hair" ? (
          <>
            {section("Hairstyle")}
            <Choices names={HAIR_STYLES} part="hair" framing="hair" draft={draft} onPick={set("hair")} tile={tile} testID="world-editor-hair" />
            {section("Hair colour")}
            <Swatches colours={people.hairColours} value={draft.hairColour} onPick={set("hairColour")} label="Hair colour" />
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
          </>
        ) : null}
        {tab === "Outfit" ? (
          <>
            {section("Outfit")}
            <Choices names={OUTFITS} part="outfit" framing="outfit" draft={draft} onPick={set("outfit")} tile={tile} testID="world-editor-outfit" />
            {section("Colour")}
            <Swatches colours={people.shirts} value={draft.shirt} onPick={set("shirt")} label="Shirt" />
            {section("Hat")}
            <Choices names={HATS} part="hat" framing="hat" draft={draft} onPick={set("hat")} tile={tile} testID="world-editor-hat" />
          </>
        ) : null}
        {tab === "Extras" ? (
          <>
            {section("Extra")}
            <Choices names={ACCESSORIES} part="accessory" framing="body" draft={draft} onPick={set("accessory")} tile={tile} testID="world-editor-extra" />
            {section("Blush")}
            <Choices names={BLUSH} part="blush" framing="face" draft={draft} onPick={set("blush")} tile={tile} testID="world-editor-blush" />
            {section("Freckles")}
            <Choices names={ON_OFF} part="freckles" framing="face" draft={draft} onPick={set("freckles")} tile={tile} testID="world-editor-freckles" />
            {section("Beard")}
            <Choices names={BEARDS} part="beard" framing="face" draft={draft} onPick={set("beard")} tile={tile} testID="world-editor-beard" />
          </>
        ) : null}
          </ScrollView>
          <View style={styles.footer}>
            <View style={styles.buttons}>
              <View style={styles.grow}>
                <Btn title="Randomise" icon="shuffle" variant="tonal" onPress={() => setDraft(randomLook())} />
              </View>
              <View style={styles.grow}>
                <Btn title="Save" icon="checkmark" onPress={save} />
              </View>
            </View>
            <Text style={[typography.caption, { color: t.muted }]}>Everyone sees your new look when you save.</Text>
          </View>
        </View>
      </View>
    </FastModal>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, paddingBottom: spacing.sm },
  screen: { flex: 1, alignItems: "center" },
  column: { flex: 1, width: "100%", maxWidth: COLUMN_WIDTH, paddingHorizontal: spacing.lg, gap: spacing.sm },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", gap: 6 },
  tab: { flex: 1, alignItems: "center", paddingHorizontal: 4, paddingVertical: 8, borderRadius: 999, backgroundColor: hud.primarySoft },
  stepsRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  // Inset by half the thumb, so the thumb never covers the end labels.
  track: { flex: 1, height: 8, borderRadius: 4, justifyContent: "center", marginHorizontal: 13 },
  stop: { position: "absolute", width: 6, height: 6, borderRadius: 3, backgroundColor: hud.cream },
  thumb: { position: "absolute", width: 26, height: 26, borderRadius: 13, backgroundColor: hud.accent, borderWidth: 2.5, borderColor: hud.forest },
  footer: { gap: spacing.sm, paddingTop: spacing.sm },
  preview: { borderRadius: 18, overflow: "hidden" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: TILE_GAP },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: hud.primarySoft },
  swatchOn: { borderWidth: 3.5 },
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
