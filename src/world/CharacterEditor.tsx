import { Btn, Sheet } from "@/components/ui";
import { spacing, typography, useAppTheme } from "@/theme";
import { ACCESSORIES, HAIR_STYLES, HATS, randomLook, type Look, type LookPart } from "@shared/world";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { garden, hud, people } from "./palette";
import { announce } from "./announce";
import { Avatar } from "./Person";
import { Ellipse } from "./Shapes";

const PREVIEW_HEIGHT = 170;

/** Turns per pixel dragged (radians). */
const TURN_PER_PX = 0.012;
/** The slow turn on its own (radians a second). */
const AUTO_TURN = 0.6;
/** After this long without a touch, the slow turn starts again. */
const AUTO_RESUME_MS = 3000;
/** How quickly a flick's spin dies away (per second). */
const SPIN_DECAY = 3;
/** The fastest a flick can spin it (radians a second). */
const MAX_SPIN = 12;

/**
 * The character on a patch of lawn. It turns slowly on its own; swipe (or
 * drag with a mouse) to turn it by hand, with a little momentum when you let
 * go. It starts turning by itself again a few seconds after the last touch.
 * The swipe stays on the preview: it doesn't scroll the list or close the
 * sheet. All on this phone; nothing is sent.
 */
const Preview = ({ look, active }: { look: Look; active: boolean }) => {
  const [width, setWidth] = useState(0);
  const [frame, setFrame] = useState({ heading: 0, t: 0 });
  const spin = useRef({ down: false, lastX: 0, lastAt: 0, velocity: 0, heading: 0, touchedAt: -Infinity });
  useEffect(() => {
    if (!active) return;
    let id = 0;
    const start = Date.now();
    let prev = start;
    // Each opening starts facing you, and only turns by itself after a moment.
    spin.current = { down: false, lastX: 0, lastAt: start, velocity: 0, heading: 0, touchedAt: start };
    const tick = () => {
      const now = Date.now();
      const dt = (now - prev) / 1000;
      prev = now;
      const d = spin.current;
      if (!d.down) {
        if (Math.abs(d.velocity) > 0.05) {
          d.heading += d.velocity * dt;
          d.velocity *= Math.exp(-SPIN_DECAY * dt);
        } else if (now - d.touchedAt > AUTO_RESUME_MS) d.heading += AUTO_TURN * dt;
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
    d.touchedAt = d.lastAt;
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
    d.touchedAt = now;
  };
  const onEnd = () => {
    const d = spin.current;
    d.down = false;
    // A finger that stopped before lifting leaves no spin.
    if (Date.now() - d.lastAt > 80) d.velocity = 0;
    d.touchedAt = Date.now();
  };
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  const s = 100;
  const foot = { x: width / 2, y: PREVIEW_HEIGHT - 28, depth: 1, scale: s };
  return (
    <View
      style={[styles.preview, { backgroundColor: garden.sky }, noBrowserGestures]}
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
        <Ellipse cx={width / 2} cy={PREVIEW_HEIGHT - 26} rx={Math.min(width * 0.42, 150)} ry={34} fill={garden.lawn} />
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
}: {
  colours: readonly string[];
  value: number;
  onPick: (index: number) => void;
  label: string;
}) => (
  <View style={styles.wrap}>
    {colours.map((colour, i) => (
      <Pressable
        key={colour}
        onPress={() => onPick(i)}
        accessibilityRole="radio"
        accessibilityState={{ selected: i === value }}
        accessibilityLabel={`${label} ${i + 1}`}
        style={[styles.swatch, { backgroundColor: colour }, i === value && styles.swatchOn]}
      />
    ))}
  </View>
);

const Choices = ({
  names,
  value,
  onPick,
  testID,
}: {
  names: readonly string[];
  value: number;
  onPick: (index: number) => void;
  testID: string;
}) => {
  const t = useAppTheme();
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
          style={[
            styles.chip,
            { borderColor: t.border, backgroundColor: t.card },
            i === value && { backgroundColor: hud.primary, borderColor: hud.primary },
          ]}
        >
          <Text style={[typography.label, { color: i === value ? hud.cream : t.text }]}>{name}</Text>
        </Pressable>
      ))}
    </View>
  );
};

/**
 * Choose your character: skin, hair, hair colour, shirt, a hat and an extra.
 * Nothing is sent while you browse; Save sends the look once.
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
  onSave: (look: Look) => Promise<string | null>;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const [draft, setDraft] = useState<Look>(look);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Start from your current look each time the editor opens, so a cancelled
  // change doesn't come back.
  const [wasVisible, setWasVisible] = useState(visible);
  // Counts openings, so a save started in one can't close the next.
  const [opening, setOpening] = useState(0);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(look);
      setError(null);
      setOpening((n) => n + 1);
    }
  }
  const latestOpening = useRef(opening);
  useEffect(() => {
    latestOpening.current = visible ? opening : -1;
  }, [opening, visible]);
  // Gone (the visit ended): a save still on its way closes nothing.
  useEffect(
    () => () => {
      latestOpening.current = -1;
    },
    []
  );
  const set = (part: LookPart) => (value: number) => setDraft((d) => ({ ...d, [part]: value }));
  const save = async () => {
    const savedIn = opening;
    setBusy(true);
    const problem = await onSave(draft);
    setBusy(false);
    // The editor was closed (and maybe opened again) while saving: leave it be.
    if (latestOpening.current !== savedIn) return;
    if (problem) {
      setError(problem);
      announce(problem);
    } else onClose();
  };
  const footer = (
    <View style={styles.footer}>
      {error ? (
        <Text style={[typography.caption, { color: t.danger }]} aria-live="polite">
          {error}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        <View style={styles.grow}>
          <Btn title="Randomise" icon="shuffle" variant="tonal" onPress={() => setDraft(randomLook())} />
        </View>
        <View style={styles.grow}>
          <Btn title="Save" icon="checkmark" loading={busy} onPress={() => void save()} />
        </View>
      </View>
      <Text style={[typography.caption, { color: t.muted }]}>Everyone in the garden sees your new look when you save.</Text>
    </View>
  );
  const section = (title: string) => <Text style={[typography.label, { color: t.muted }]}>{title}</Text>;
  return (
    <Sheet visible={visible} onClose={onClose} title="Your character" scrollable={false} footer={footer}>
      <View style={styles.stack}>
        {/* The preview stays put while the choices scroll under it. */}
        <Preview look={draft} active={visible} />
        <ScrollView style={styles.choices} contentContainerStyle={styles.stack}>
        {section("Skin")}
        <Swatches colours={people.skins} value={draft.skin} onPick={set("skin")} label="Skin" />
        {section("Hair")}
        <Choices names={HAIR_STYLES} value={draft.hair} onPick={set("hair")} testID="world-editor-hair" />
        {section("Hair colour")}
        <Swatches colours={people.hairColours} value={draft.hairColour} onPick={set("hairColour")} label="Hair colour" />
        {section("Shirt")}
        <Swatches colours={people.shirts} value={draft.shirt} onPick={set("shirt")} label="Shirt" />
        {section("Hat")}
        <Choices names={HATS} value={draft.hat ?? 0} onPick={set("hat")} testID="world-editor-hat" />
        {section("Extra")}
        <Choices names={ACCESSORIES} value={draft.accessory ?? 0} onPick={set("accessory")} testID="world-editor-extra" />
        </ScrollView>
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  stack: { gap: spacing.sm, paddingBottom: spacing.sm },
  choices: { maxHeight: 200 },
  footer: { gap: spacing.sm },
  preview: { height: PREVIEW_HEIGHT, borderRadius: 18, overflow: "hidden", marginBottom: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatch: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: hud.primarySoft },
  swatchOn: { borderWidth: 3.5, borderColor: hud.forest },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  buttons: { flexDirection: "row", gap: spacing.sm },
  grow: { flex: 1 },
});
