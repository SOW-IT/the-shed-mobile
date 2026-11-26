import {
  BACKYARD,
  BUBBLE_MS,
  TYPING_MS,
  inWater,
  EMOTE_MS,
  EMOTES,
  isEmote,
  liveMutual,
  MUTUALS,
  askInfo,
  openAsk,
  type Ask,
  type Reply,
  hash,
  ASK_MS,
  OBSTACLES,
  PLACE_OBSTACLES,
  PLACE_TITLES,
  PORTAL_RADIUS,
  PORTALS,
  NPC,
  FARMER,
  DUEL_PICKS,
  seatIn,
  type Place,
  type Look,
  type Walk,
} from "@shared/world";
import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type LayoutChangeEvent, type ViewStyle } from "react-native";
import { makeCamera } from "./camera";
import { Builder, itemAt, type Prim, type Prop } from "./gardenScene";
import { farm as farmPalette, garden, hud, places } from "./palette";
import { popShadow } from "./popShadow";
import { buildScene, type HomeLook } from "./placeScenes";
import { footprint, isFurniture } from "@shared/home";
import { Avatar, figureFor, headTop, hitBox, palmHeight, sitRise, swimSink, Tag, touchK, type Doing } from "./Person";
import { accepted } from "./announce";
import type { DrawnPose, Gait } from "./gait";
import { Marker } from "./Marker";
import { HUD_HEIGHT, PersonHud, type HudAction } from "./PersonHud";
import { Ellipse, Shape } from "./Shapes";
import type { PlayingTag } from "./cafe";
import { duelLookFor, type DuelView } from "./duel";
import { planClock, shouldRefreshClock, useFrameTicks } from "./frameClock";
import { tagShown, useBatterySaver, useWorldName, useWorldSetting } from "./settings";
import { layerOrder } from "./tags";
import { tapTarget } from "./personHit";
import { CampfireFlames } from "./Campfire";
import { CropThumb, FlyingCrop, PlantingPuff, PlantView, PlotCard, PlotNote, PriceTag, WateringCan, type FarmCardData } from "./Farm";
import { BUILDING_IDS, FREE_PLOTS, PENS, PLOT_SIZE, PLOTS, plotPrice, type BuildingId, type CropId, type Stage } from "@shared/farm";
import { animalFor, buildingFor, BUILDINGS } from "@shared/animals";
import { animalAt, GoodThumb, PenAnimals, type PenAnimal } from "./Animals";
import { penPoint, phaseFor, zoneOf, type PenCorners } from "./animalMotion";
import { useGlide } from "./useGlide";
import { seatAt } from "./seats";
import { myPoseLabel } from "./myPose";
import { bubbleAge, mouthAt, nextFlapAt, talkAge } from "./talk";
import { BALL_PLACE, BALL_RADIUS, ballAt, KICK_GAP_MS, KICK_TAP_REACH, KICK_TOUCH, kickDirection, restingBall, type Ball, type RollingBall } from "@shared/ball";

type GardenPerson = {
  memberId: string;
  name: string;
  look: Look;
  me: boolean;
  walk: Walk | null;
  gait?: Gait;
  say?: { text: string; at: number };
  act?: { emote: string; at: number };
  ask?: Ask;
  reply?: Reply;
  /** Asks this person accepted that are still open. */
  answered?: Reply[];
  muted: boolean;
  away?: boolean;
  reading?: boolean;
  seat?: string;
  typing?: number;
  playing?: PlayingTag;
};

export type GardenFarm = {
  plots: number;
  mine: boolean;
  plants: readonly { plot: number; crop: string; stage: Stage; progress: number; wilted: boolean; thirsty: boolean; wet: boolean; note?: string }[];
  card: { plot: number; data: FarmCardData } | null;
  watering: { plot: number; key: number } | null;
  flying: { plot: number; crop: CropId; key: number } | null;
  bagAt: { x: number; y: number };
  onTapPlot: (plot: number) => void;
  onWatered: () => void;
  onFlown: () => void;
  planting: { plot: number; crop: CropId; key: number } | null;
  onPlanted: () => void;
  describe: (plot: number) => string | null;
};

export type GardenYard = {
  coop: boolean;
  barn: boolean;
  mine: boolean;
  animals: readonly (PenAnimal & { label: string })[];
  card: { at: BuildingId; data: FarmCardData } | null;
  feeding: { id: string; key: number } | null;
  collecting: { id: string; good: "egg" | "milk"; key: number } | null;
  onTapAnimal: (id: string) => void;
  onTapBuilding: (kind: BuildingId) => void;
  onFed: () => void;
  onCollected: () => void;
  onLeft: (id: string) => void;
};

export type InteractivePropId = "arcade" | "noticeboard" | "notices" | "piano" | "lectern";
export type HighlightTarget = { kind: "prop"; id: InteractivePropId } | { kind: "seat"; id: string };

const INTERACTIVE_PROPS = new Set<string>(["arcade", "noticeboard", "notices", "piano", "lectern"]);
const isInteractiveProp = (value: string | undefined): value is InteractivePropId =>
  value !== undefined && INTERACTIVE_PROPS.has(value);

/** What the camera looks at: style C's framing of the courtyard. */
const FOCUS = { x: 0, z: -2.6 };
const ARCADE = OBSTACLES.find((o) => o.id === "arcade")!;
const FIRE = PLACE_OBSTACLES.campfire.find((o) => o.id === "fire")!;

const Layer = memo(function Layer({ prims }: { prims: Prim[] }) {
  return (
    <>
      {prims.map((prim) => (
        <Shape key={prim.key} prim={prim} />
      ))}
    </>
  );
});

const PropView = memo(function PropView({ prop }: { prop: Prop }) {
  return <Layer prims={prop.prims} />;
});

const startsOf = (people: readonly { reply?: Reply }[], seen: Record<string, number>) => {
  const current: Record<string, number> = {};
  for (const p of people) {
    if (!p.reply) continue;
    const key = `${p.reply.to}:${p.reply.askAt}`;
    current[key] = seen[key] ?? p.reply.at;
  }
  return current;
};

const sameStarts = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

/**
 * The garden drawn with plain views: no GL, so it runs on the Simulator and
 * ships over the air. Taps on the ground walk; taps on a person open them.
 */
export const Garden = ({
  people,
  serverNow,
  target,
  onHoldStart,
  onHoldMove,
  onHoldEnd,
  onTapPerson,
  onTapArcade,
  onTapNoticeBoard,
  homeExit,
  cardTop = 0,
  onTapNotices,
  onTapPiano,
  onTapLectern,
  onTapSeat,
  highlighted = null,
  onAccept,
  onDecline,
  declined,
  selected,
  hudActions,
  place,
  placeCounts,
  duels = [],
  home = null,
  onTapNpc,
  onTapFarmer,
  decor = null,
  ball = null,
  onKick,
  paused = false,
  farm = null,
  yard = null,
}: {
  people: GardenPerson[];
  serverNow: () => number;
  /** Where you're walking to, for the marker. */
  target: { x: number; z: number } | null;
  /** A finger down on the ground, moving while held, and lifted. */
  onHoldStart: (x: number, z: number) => void;
  onHoldMove: (x: number, z: number) => void;
  onHoldEnd: (x: number, z: number) => void;
  onTapPerson: (memberId: string) => void;
  onTapArcade: () => void;
  onTapNoticeBoard?: () => void;
  /** The board on the left: your notifications and the admins' notices. */
  onTapNotices?: () => void;
  onTapPiano?: () => void;
  onTapLectern?: () => void;
  onTapSeat: (seatId: string) => void;
  highlighted?: HighlightTarget | null;
  /** Accept the ask `from` made of you at `askAt`. */
  onAccept: (from: string, askAt: number) => void;
  /** Hide an ask made of you; it lapses on its own, so nothing is sent. */
  onDecline: (from: string, askAt: number) => void;
  /** Asks you've declined, as `${from}:${askAt}`. */
  declined: ReadonlySet<string>;
  selected: string | null;
  hudActions: HudAction[];
  place: Place;
  placeCounts?: Record<string, number>;
  duels?: readonly DuelView[];
  home?: HomeLook | null;
  /** Where a home's door leads: the place you came from. */
  homeExit?: Place;
  cardTop?: number;
  onTapNpc?: () => void;
  onTapFarmer?: () => void;
  decor?: {
    selected: string | null;
    onItem: (key: string) => void;
    onFloor: (x: number, z: number) => void;
    actions: HudAction[];
    hudTop: number;
  } | null;
  ball?: Ball | null;
  onKick?: (dirX: number, dirZ: number) => void;
  paused?: boolean;
  farm?: GardenFarm | null;
  yard?: GardenYard | null;
}) => {
  const liveHud = selected ? { id: selected, actions: hudActions } : null;
  const [keptHud, setKeptHud] = useState(liveHud);
  if (liveHud && keptHud?.id !== liveHud.id) setKeptHud(liveHud);
  const hudShown = liveHud ?? keptHud;
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.width !== width || size.height !== height) setSize({ width, height });
  };
  const cam = useMemo(() => size && makeCamera(size.width, size.height, FOCUS), [size]);
  const plots = farm?.plots ?? FREE_PLOTS;
  const coop = yard?.coop === true;
  const barn = yard?.barn === true;
  const scene = useMemo(() => cam && buildScene(place, cam, home ?? undefined, { plots, coop, barn }), [cam, place, home, plots, coop, barn]);
  const pens = useMemo(() => (cam && place === BACKYARD ? penScreens(cam) : null), [cam, place]);
  const yardAnimals = yard?.animals;
  const penHerds = useMemo(() => ({ coop: (yardAnimals ?? []).filter((a) => a.kind === "chicken"), barn: (yardAnimals ?? []).filter((a) => a.kind === "cow") }), [yardAnimals]);
  const propActors = useMemo(
    () =>
      scene
        ? scene.props.map((prop) => ({
            depth: prop.depth,
            key: prop.id,
            node: <PropView prop={prop} />,
          }))
        : [],
    [scene]
  );
  const padSpots = useMemo(
    () =>
      cam
        ? PORTALS[place].map((pad) => {
            const below = cam.project([pad.x, 0, pad.z + PORTAL_RADIUS + 0.45]);
            const above = cam.project([pad.x, 0, pad.z - PORTAL_RADIUS - 0.45]);
            const up = below.y > cam.height - PAD_LABEL_CLEAR_BOTTOM;
            const at = up ? { x: above.x, y: above.y - 14 } : below;
            // Someone standing on a pad whose name sits above it (they arrive
            // there) would wear the name on their own: it moves beside the pad.
            const middle = cam.project([pad.x, 0, pad.z]);
            const reach = PORTAL_RADIUS * middle.scale + PAD_LABEL_BESIDE_GAP;
            const toRight = pad.x <= 0;
            return {
              to: place === "home" && pad.to !== BACKYARD && homeExit ? homeExit : pad.to,
              x: pad.x,
              z: pad.z,
              up,
              left: Math.min(Math.max(4, at.x - PAD_LABEL_WIDTH / 2), cam.width - PAD_LABEL_WIDTH - 4),
              top: at.y - 10,
              beside: {
                left: Math.min(Math.max(4, toRight ? middle.x + reach : middle.x - reach - PAD_LABEL_WIDTH), cam.width - PAD_LABEL_WIDTH - 4),
                top: middle.y - 10,
                alignItems: toRight ? ("flex-start" as const) : ("flex-end" as const),
              },
            };
          })
        : [],
    [cam, place, homeExit]
  );
  const npcHere = place === NPC.place;
  const farmerHere = place === FARMER.place;

  const saver = useBatterySaver();
  const [tagMode] = useWorldSetting("nameTags");
  const worldName = useWorldName();
  const [clockAt, setClockAt] = useState(serverNow);
  const [clockInputs, setClockInputs] = useState({ paused, people, ball, duels });
  const inputsChanged =
    clockInputs.paused !== paused ||
    clockInputs.people !== people ||
    clockInputs.ball !== ball ||
    clockInputs.duels !== duels;
  const refreshNow = shouldRefreshClock({ wasPaused: clockInputs.paused, paused, inputsChanged });
  const now = refreshNow ? serverNow() : clockAt;
  if (inputsChanged) {
    setClockInputs({ paused, people, ball, duels });
    if (refreshNow) setClockAt(now);
  }
  // Your own walk as it is; others glide toward each new walk from the server.
  // A copy: a high five below steps people in and out of where they're drawn.
  const poses = [...useGlide(people, now)];
  // When each accepted mutual action was first seen to start (see below).
  // Kept only while that reply stays on screen without a break: the
  // optimistic one hands straight over to the server's, but a refused accept
  // vanishes, so a retry starts afresh.
  const [firstStarts, setFirstStarts] = useState<Record<string, number>>({});
  const currentStarts = startsOf(people, firstStarts);
  if (!sameStarts(currentStarts, firstStarts)) setFirstStarts(currentStarts);
  const sitting = people.map((p, i) => {
    const pose = poses[i];
    const seat = seatIn(place, p.seat);
    return seat && pose && !pose.walking && Math.hypot(pose.x - seat.x, pose.z - seat.z) < SEATED_WITHIN ? seat : null;
  });
  const me = people.findIndex((p) => p.me);
  // Where you're walking (before any high-five step), for the target marker.
  const placed = me >= 0 ? poses[me] : null;
  const recent = (at: number | undefined, ms: number) => at !== undefined && now - at < ms;
  // What each person is doing: a mutual action with someone (worked out from
  // the asker's ask and the other's answer), or else an emote.
  const doing: Doing[] = people.map(() => null);
  const startedAt = currentStarts;
  // Where each high five's palms meet (world), and how far into the reach.
  const touches: { x: number; y: number; z: number; k: number; i: number; j: number }[] = [];
  const facingOverride: (number | null)[] = people.map(() => null);
  people.forEach((asker, i) => {
    if (!asker.ask) return;
    const j = people.findIndex((p) => p.memberId === asker.ask?.to);
    const a = poses[i];
    const b = j >= 0 ? poses[j] : null;
    if (j < 0 || !a || !b) return;
    // The first start time seen for this accept: the optimistic one on the
    // accepter's own phone, so the server's slightly later copy doesn't
    // restart the animation.
    const answer = people[j].reply;
    const key = answer ? `${answer.to}:${answer.askAt}` : "";
    const reply = answer && startedAt[key] !== undefined ? { ...answer, at: Math.min(startedAt[key], answer.at) } : answer;
    const live = liveMutual({ id: asker.memberId, ask: asker.ask }, { id: people[j].memberId, reply }, now);
    // One at a time each: if A-B and B-C both play at once, B keeps the first,
    // so B's hands, steps and spark all belong to the same pair.
    if (!live || doing[i] || doing[j]) return;
    // Turn to face each other; the hand goes up on the side the other is on screen.
    const toward = b.x >= a.x ? 1 : -1;
    doing[i] = { kind: "mutual", id: live.kind, p: live.progress, toward };
    doing[j] = { kind: "mutual", id: live.kind, p: live.progress, toward: toward > 0 ? -1 : 1 };
    facingOverride[i] = Math.atan2(b.x - a.x, b.z - a.z);
    facingOverride[j] = Math.atan2(a.x - b.x, a.z - b.z);
    // Step toward each other until the raised palms can meet at the midpoint,
    // hold, then step back to where they were. Drawn only: nothing is sent.
    const gap = Math.hypot(b.x - a.x, b.z - a.z);
    const k = touchK(live.progress);
    const step = (Math.max(0, gap / 2 - TOUCH_HALF_GAP) * k) / (gap || 1);
    const dx = (b.x - a.x) * step;
    const dz = (b.z - a.z) * step;
    poses[i] = { ...a, x: a.x + dx, z: a.z + dz };
    poses[j] = { ...b, x: b.x - dx, z: b.z - dz };
    const contact = { x: (a.x + b.x) / 2, y: palmsMeetAt(asker.look, people[j].look), z: (a.z + b.z) / 2, k, i, j };
    touches.push(contact);
  });
  const duelLooks = people.map((p) => duelLookFor(duels, p.memberId, now));
  duelLooks.forEach((look, i) => {
    if (!look) return;
    const j = people.findIndex((p) => p.memberId === look.opponent);
    const a = poses[i];
    const b = j >= 0 ? poses[j] : null;
    if (a && b && facingOverride[i] === null) facingOverride[i] = Math.atan2(b.x - a.x, b.z - a.z);
    if (look.result && !doing[i]) doing[i] = { kind: "emote", id: look.result.emote, p: look.result.p };
  });
  people.forEach((p, i) => {
    if (doing[i] || p.muted || !p.act || !isEmote(p.act.emote) || !recent(p.act.at, EMOTE_MS)) return;
    doing[i] = { kind: "emote", id: p.act.emote, p: (now - p.act.at) / EMOTE_MS };
  });
  const meId = me >= 0 ? people[me].memberId : null;
  // Asks made of you that are still open and not answered or declined.
  const asks = people.filter(
    (p) =>
      p.ask?.to === meId &&
      openAsk(p.ask, now) !== null &&
      !declined.has(`${p.memberId}:${p.ask.at}`) &&
      !accepted(me >= 0 ? people[me] : undefined, p.memberId, p.ask.at)
  );
  const bubbles = people.map((p) => (p.muted ? null : bubbleAge(p.say, now)));
  const bubbleFades = bubbles.map((age) => (age === null ? 0 : saver ? 1 : bubbleFade(age)));
  const typingSince = people.map((p) =>
    !p.muted && p.typing !== undefined && now - p.typing < TYPING_MS && (!p.say || p.say.at < p.typing) ? p.typing : undefined
  );
  const headings = people.map((p, i) => {
    const pose = poses[i];
    if (!pose) return 0;
    const atArcade = p.away ? Math.atan2(ARCADE.x - pose.x, ARCADE.z - pose.z) : null;
    return facingOverride[i] ?? atArcade ?? sitting[i]?.heading ?? pose.heading;
  });
  const talkAges = people.map((p) => (p.muted ? null : talkAge(p.say, now)));
  const talking = talkAges.map((age, i) => mouthAt(age, headings[i]));
  const rolled = place === BALL_PLACE ? ballAt(ball ?? restingBall(), now) : null;
  const meTouching = rolled !== null && placed !== null && placed.walking && Math.hypot(placed.x - rolled.x, placed.z - rolled.z) < KICK_TOUCH;
  const kickRef = useRef(onKick);
  const kickFrom = useRef({ me: placed, ball: rolled });
  const keptAt = useRef(0);
  useEffect(() => {
    kickRef.current = onKick;
    kickFrom.current = { me: placed, ball: rolled };
  });
  useEffect(() => {
    const { me: at, ball: there } = kickFrom.current;
    if (!meTouching || !at || !there || Date.now() - keptAt.current < KICK_GAP_MS) return;
    keptAt.current = Date.now();
    const dir = kickDirection(at, there, { x: Math.sin(at.heading), z: Math.cos(at.heading) });
    kickRef.current?.(dir.x, dir.z);
  }, [meTouching]);
  const swimmers = people.map((p, i) => {
    const pose = poses[i];
    return pose ? !sitting[i] && !p.away && inWater(place, pose) : false;
  });
  const animating =
    poses.some((pose) => pose && (pose.walking || pose.strideAmp > 0 || pose.turning)) ||
    swimmers.some((swimming, i) => swimming && poses[i]?.walking === true) ||
    doing.some((d) => d !== null) ||
    asks.length > 0 ||
    (!saver && typingSince.some((at) => at !== undefined)) ||
    rolled?.rolling === true ||
    duelLooks.some((look) => look !== null) ||
    (!saver && highlighted !== null) ||
    (!saver && people.some((p) => !p.muted && p.say !== undefined && bubbleMoving(now - p.say.at)));
  useFrameTicks(
    planClock({
      moving: animating,
      ambient: swimmers.some(Boolean),
      paused,
      now,
      saver,
      deadlines: people.flatMap((p) => [
        p.say && p.say.at,
        p.say && p.say.at + BUBBLE_IN_MS,
        p.say && p.say.at + BUBBLE_MS - BUBBLE_OUT_MS,
        p.say && p.say.at + BUBBLE_MS,
        p.act && p.act.at + EMOTE_MS,
        p.typing === undefined ? undefined : p.typing + TYPING_MS,
        p.ask && p.ask.at + ASK_MS,
        p.reply && p.reply.at,
      ]).concat(ball ? [ball.at] : [], people.map((p, i) => {
        const age = talkAges[i];
        return p.say && age !== null && talking[i] !== undefined ? nextFlapAt(p.say.at, age) : undefined;
      })),
    }),
    serverNow,
    setClockAt
  );
  const t = now / 1000;
  const mine = me >= 0 ? poses[me] : null;
  const press = useRef<{
    x: number;
    y: number;
    hit: Hit;
    walking: boolean;
    timer: ReturnType<typeof setTimeout> | null;
    /** The last point of this press that was on the ground. */
    spot: { x: number; z: number } | null;
  }>({ x: 0, y: 0, hit: { kind: "ground" }, walking: false, timer: null, spot: null });

  /** Where a touch is on the stage. Children don't take touches, so it's the stage's own. */
  const where = (e: GestureResponderEvent) => {
    const { locationX: x, locationY: y } = e.nativeEvent;
    return typeof x === "number" && typeof y === "number" ? { x, y } : null;
  };

  /** What a point on the stage would be a tap on: a person, the arcade, or the ground. */
  const hitAt = (x: number, y: number): Hit => {
    if (!cam || !scene) return { kind: "ground" };
    // People first, nearest the camera first.
    // The arcade cabinet as drawn (its faces stand well above the ground).
    // Where it and a person overlap, whichever is drawn in front wins.
    const target = tapTarget(
      people
        .map((p, i) => ({ p, pose: poses[i], rise: sitRise(sitting[i]?.height, p.look) }))
        .filter((h): h is { p: GardenPerson; pose: DrawnPose; rise: number } => h.pose !== null)
        .map((h) => {
          const figure = figureFor(cam, h.pose);
          return { ...h, me: h.p.me, box: hitBox({ ...figure, bob: figure.bob + h.rise }, h.p.look), depth: figure.foot.depth };
        }),
      scene.props.filter((prop) => isInteractiveProp(prop.tap)),
      x,
      y
    );
    if (target?.kind === "person") return { kind: "person", id: target.person.p.memberId };
    if (target?.kind === "prop" && isInteractiveProp(target.prop.tap)) return { kind: target.prop.tap };
    if (rolled && placed && Math.hypot(placed.x - rolled.x, placed.z - rolled.z) <= KICK_TAP_REACH) {
      const centre = cam.project([rolled.x, BALL_RADIUS, rolled.z]);
      if (Math.hypot(centre.x - x, centre.y - y) <= BALL_RADIUS * 1.6 * centre.scale) return { kind: "ball" };
    }
    if (npcHere) {
      const box = hitBox(figureFor(cam, NPC_POSE), NPC.look);
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return { kind: "npc" };
    }
    if (farmerHere) {
      const box = hitBox(figureFor(cam, FARMER_POSE), FARMER.look);
      if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return { kind: "farmer" };
    }
    if (yard && pens && place === BACKYARD) {
      const hit = yardAtScreen(cam, pens, yard, x, y, !paused && !saver);
      if (hit) return hit;
    }
    if (farm && place === BACKYARD) {
      const plot = plotAtScreen(cam, x, y);
      if (plot !== null) return { kind: "plot", index: plot };
    }
    if (decor) {
      const item = itemAt(scene.props, x, y);
      if (item) return { kind: "item", key: item };
      if (decor.selected) return { kind: "floor" };
    }
    const seat = seatAt(place, cam, x, y);
    if (seat) return { kind: "seat", id: seat };
    const spot = cam.ground(x, y);
    if (spot) {
      for (const obs of PLACE_OBSTACLES[place]) {
        if (!isInteractiveProp(obs.id)) continue;
        if (Math.hypot((spot.x - obs.x) / (obs.rx + 0.35), (spot.z - obs.z) / (obs.rz + 0.35)) <= 1) {
          return { kind: obs.id };
        }
      }
    }
    return { kind: "ground" };
  };

  /** Starts walking toward a screen point, if it's on the ground. */
  const walkFrom = (x: number, y: number, phase: "start" | "move" | "end") => {
    // A finger lifted off the ground (above the horizon) still ends the hold,
    // at the last spot it was on the ground.
    const spot = cam?.ground(x, y) ?? (phase === "end" ? press.current.spot : null);
    if (!spot) return;
    press.current.spot = spot;
    if (phase === "start") onHoldStart(spot.x, spot.z);
    else if (phase === "move") onHoldMove(spot.x, spot.z);
    else onHoldEnd(spot.x, spot.z);
  };

  // Touch handling. On the ground the walk starts on touch DOWN and follows
  // the finger while it's held or dragged. On a person or the arcade a quick
  // tap opens them; holding there (or dragging away) walks instead, so a
  // hold never opens a sheet.
  const onGrant = (e: GestureResponderEvent) => {
    const at = where(e);
    if (!at) return;
    const hit = hitAt(at.x, at.y);
    if (press.current.timer) clearTimeout(press.current.timer);
    if (hit.kind === "item" || hit.kind === "floor") {
      press.current = { ...at, hit, walking: false, timer: null, spot: null };
      return;
    }
    // The World has no swipe back (you leave from its menu), so a touch at the
    // screen's edge walks like anywhere else.
    press.current = { ...at, hit, walking: hit.kind === "ground", timer: null, spot: null };
    if (hit.kind === "ground") walkFrom(at.x, at.y, "start");
    else {
      press.current.timer = setTimeout(() => {
        const p = press.current;
        if (p.walking || p.hit.kind === "ground") return;
        p.walking = true;
        walkFrom(p.x, p.y, "start");
      }, HOLD_TO_WALK_MS);
    }
  };
  const onMove = (e: GestureResponderEvent) => {
    const at = where(e);
    const p = press.current;
    if (!at || p.hit.kind === "item" || p.hit.kind === "floor") return;
    if (!p.walking) {
      if (Math.hypot(at.x - p.x, at.y - p.y) < TAP_SLOP) return;
      if (p.timer) clearTimeout(p.timer);
      p.walking = true;
      walkFrom(at.x, at.y, "start");
      return;
    }
    walkFrom(at.x, at.y, "move");
  };
  const onRelease = (e: GestureResponderEvent) => {
    const p = press.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    const at = where(e) ?? p;
    if (p.walking) return walkFrom(at.x, at.y, "end");
    if (p.hit.kind === "person") onTapPerson(p.hit.id);
    else if (p.hit.kind === "arcade") onTapArcade();
    else if (p.hit.kind === "noticeboard") onTapNoticeBoard?.();
    else if (p.hit.kind === "notices") onTapNotices?.();
    else if (p.hit.kind === "piano") onTapPiano?.();
    else if (p.hit.kind === "lectern") onTapLectern?.();
    else if (p.hit.kind === "seat") onTapSeat(p.hit.id);
    else if (p.hit.kind === "npc") onTapNpc?.();
    else if (p.hit.kind === "farmer") onTapFarmer?.();
    else if (p.hit.kind === "plot") farm?.onTapPlot(p.hit.index);
    else if (p.hit.kind === "animal") yard?.onTapAnimal(p.hit.id);
    else if (p.hit.kind === "building") yard?.onTapBuilding(p.hit.id);
    else if (p.hit.kind === "ball" && placed && rolled) {
      const dir = kickDirection(placed, rolled);
      onKick?.(dir.x, dir.z);
    }
    else if (p.hit.kind === "item") decor?.onItem(p.hit.key);
    else if (p.hit.kind === "floor") {
      const spot = cam?.ground(at.x, at.y);
      if (spot) decor?.onFloor(spot.x, spot.z);
    }
  };
  // The system took the touch away (a call, a system gesture): it was no tap,
  // so open nothing; a walk in progress ends where the finger last was.
  const onCancel = () => {
    const p = press.current;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    if (p.walking && p.spot) onHoldEnd(p.spot.x, p.spot.z);
    p.walking = false;
    p.hit = { kind: "ground" };
  };

  if (!cam || !scene) return <View style={styles.fill} onLayout={onLayout} />;

  const actors: { depth: number; key: string; node: ReactNode; tag?: boolean }[] = [...propActors];
  if (npcHere) {
    const figure = figureFor(cam, NPC_POSE);
    actors.push({ depth: figure.foot.depth, key: NPC.id, node: <Avatar figure={figure} pose={NPC_POSE} look={NPC.look} t={0} seed={3} /> });
    const head = cam.project([NPC.x, headTop(NPC.look), NPC.z]);
    actors.push({ depth: figure.foot.depth, key: `${NPC.id}:tag`, tag: true, node: <Tag x={head.x} y={head.y} name={NPC_TAG} me={false} npc emoteRise={0} /> });
  }
  if (farmerHere) {
    const figure = figureFor(cam, FARMER_POSE);
    actors.push({ depth: figure.foot.depth, key: FARMER.id, node: <Avatar figure={figure} pose={FARMER_POSE} look={FARMER.look} t={0} seed={5} doing={FARMER_CHEER} /> });
    const head = cam.project([FARMER.x, headTop(FARMER.look), FARMER.z]);
    actors.push({ depth: figure.foot.depth, key: `${FARMER.id}:tag`, tag: true, node: <Tag x={head.x} y={head.y} name={FARMER_TAG} me={false} npc emoteRise={0} /> });
  }
  if (place === "campfire") {
    const base = cam.project([FIRE.x, 0, FIRE.z]);
    actors.push({ depth: base.depth - 0.001, key: "fire-flames", node: <CampfireFlames x={base.x} y={base.y} scale={base.scale} live={!paused && !saver} /> });
  }
  const farmLabels: ReactNode[] = [];
  if (farm && place === BACKYARD) {
    const live = !paused && !saver;
    for (const plant of farm.plants) {
      const spot = PLOTS[plant.plot];
      if (!spot || farm.planting?.plot === plant.plot) continue;
      const at = cam.project([spot.x, 0, spot.z]);
      if (plant.wet) {
        const wet = new Builder(cam, `wet-${plant.plot}`);
        wet.groundQuad([[spot.x - PLOT_SIZE.w / 2, spot.z - PLOT_SIZE.d / 2], [spot.x + PLOT_SIZE.w / 2, spot.z - PLOT_SIZE.d / 2], [spot.x + PLOT_SIZE.w / 2, spot.z + PLOT_SIZE.d / 2], [spot.x - PLOT_SIZE.w / 2, spot.z + PLOT_SIZE.d / 2]], farmPalette.wet, 0.012);
        actors.push({ depth: at.depth + 100, key: `wet-${plant.plot}`, node: <Layer prims={wet.take()} /> });
      }
      actors.push({
        depth: at.depth,
        key: `plant-${plant.plot}`,
        node: <PlantView x={at.x} y={at.y} scale={at.scale * PLANT_SCALE} crop={plant.crop} stage={plant.stage} progress={plant.progress} wilted={plant.wilted} thirsty={plant.thirsty} live={live} />,
      });
      if (plant.note) {
        const below = cam.project([spot.x, 0, spot.z + PLOT_SIZE.d / 2 - 0.1]);
        farmLabels.push(<PlotNote key={`note-${plant.plot}`} x={below.x} y={below.y - 18} text={plant.note} />);
      }
    }
    if (farm.mine) {
      for (const spot of PLOTS) {
        const price = plotPrice(spot.index);
        if (spot.index < farm.plots || price === null) continue;
        const at = cam.project([spot.x, 0, spot.z]);
        farmLabels.push(<PriceTag key={`price-${spot.index}`} x={at.x} y={at.y} price={price} />);
      }
    }
    if (farm.watering) {
      const spot = PLOTS[farm.watering.plot];
      const at = cam.project([spot.x, 0, spot.z]);
      actors.push({ depth: at.depth - 0.5, key: `can-${farm.watering.key}`, node: <WateringCan x={at.x} y={at.y} scale={at.scale * PLANT_SCALE * 0.8} live={live} onDone={farm.onWatered} /> });
    }
    if (farm.planting) {
      const spot = PLOTS[farm.planting.plot];
      const at = cam.project([spot.x, 0, spot.z]);
      actors.push({ depth: at.depth, key: `planting-${farm.planting.key}`, node: <PlantingPuff x={at.x} y={at.y} scale={at.scale * PLANT_SCALE} crop={farm.planting.crop} live={live} onDone={farm.onPlanted} /> });
    }
    if (farm.card) {
      const spot = PLOTS[farm.card.plot];
      const top = cam.project([spot.x, 1.1, spot.z]);
      farmLabels.push(<PlotCard key="card" x={top.x} y={top.y} card={farm.card.data} stageWidth={cam.width} minTop={cardTop} />);
    }
    if (farm.flying) {
      const spot = PLOTS[farm.flying.plot];
      const from = cam.project([spot.x, 0.3, spot.z]);
      farmLabels.push(
        <FlyingCrop key={`fly-${farm.flying.key}`} from={from} to={farm.bagAt} live={live} onDone={farm.onFlown}>
          <CropThumb crop={farm.flying.crop} size={56} />
        </FlyingCrop>
      );
    }
  }
  if (yard && pens && place === BACKYARD) {
    const live = !paused && !saver;
    for (const id of BUILDING_IDS) {
      const pen = pens[id];
      if (!yard[id]) {
        if (yard.mine) farmLabels.push(<PriceTag key={`price-${id}`} x={pen.middle.x} y={pen.middle.y} price={BUILDINGS[id].price} />);
        continue;
      }
      const here = penHerds[id];
      actors.push({
        depth: pen.middle.depth,
        key: `animals-${id}`,
        node: <PenAnimals slots={BUILDINGS[id].capacity} pen={pen.corners} gate={pen.gate} exit={pen.exit} animals={here} live={live} feeding={yard.feeding} onFed={yard.onFed} onLeft={yard.onLeft} />,
      });
    }
    if (yard.card) {
      const top = pens[yard.card.at].top;
      farmLabels.push(<PlotCard key="yard-card" x={top.x} y={top.y} card={yard.card.data} stageWidth={cam.width} minTop={cardTop} />);
    }
    if (yard.collecting) {
      const { id, good } = yard.collecting;
      const animal = yard.animals.find((a) => a.id === id);
      if (animal) {
        const building = buildingFor(animal.kind);
        const here = yard.animals.filter((a) => buildingFor(a.kind) === building);
        const at = animalAt(pens[building].corners, id, animal.mood, phaseFor(live, yard.collecting.key), zoneOf(here.indexOf(animal), Math.max(BUILDINGS[building].capacity, here.length)));
        farmLabels.push(
          <FlyingCrop key={`collect-${yard.collecting.key}`} from={{ x: at.x, y: at.y - 0.4 * at.scale }} to={farm?.bagAt ?? { x: 54, y: 30 }} live={live} onDone={yard.onCollected}>
            <GoodThumb good={good} size={48} />
          </FlyingCrop>
        );
      }
    }
  }
  if (rolled) {
    const ground = cam.project([rolled.x, 0, rolled.z]);
    actors.push({ depth: ground.depth, key: "ball", node: <BeachBall ball={rolled} cam={cam} t={t} /> });
  }
  if (highlighted) {
    const pulse = saver ? 1 : 0.94 + 0.08 * Math.sin(t * 4);
    const glowOpacity = saver ? 0.2 : 0.3 + 0.16 * (0.5 + 0.5 * Math.sin(t * 4));
    const ringOpacity = saver ? 0.55 : 0.85 + 0.15 * Math.sin(t * 4);
    if (highlighted.kind === "prop") {
      const obs = PLACE_OBSTACLES[place].find((o) => o.id === highlighted.id);
      if (obs) {
        const at = cam.project([obs.x, 0.03, obs.z]);
        const rx = (obs.rx + 0.34) * at.scale * pulse;
        const ry = (obs.rz + 0.34) * at.scale * 0.58 * pulse;
        actors.push({
          depth: at.depth + 0.5,
          key: "highlight",
          node: (
            <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="world-highlight">
              <Ellipse cx={at.x} cy={at.y} rx={rx * 1.18} ry={ry * 1.18} fill={garden.highlightGlow} opacity={glowOpacity} />
              <Ellipse cx={at.x} cy={at.y} rx={rx} ry={ry} fill="transparent" ink={saver ? 2 : 3} inkColour={garden.highlight} opacity={ringOpacity} />
            </View>
          ),
        });
      }
    } else {
      const seat = seatIn(place, highlighted.id);
      if (seat) {
        const at = cam.project([seat.x, seat.height + 0.03, seat.z]);
        const rx = 0.58 * at.scale * pulse;
        const ry = 0.42 * at.scale * 0.58 * pulse;
        actors.push({
          depth: at.depth - 0.15,
          key: "highlight",
          node: (
            <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="world-highlight">
              <Ellipse cx={at.x} cy={at.y} rx={rx * 1.2} ry={ry * 1.2} fill={garden.highlightGlow} opacity={glowOpacity} />
              <Ellipse cx={at.x} cy={at.y} rx={rx} ry={ry} fill="transparent" ink={saver ? 2 : 3} inkColour={garden.highlight} opacity={ringOpacity} />
            </View>
          ),
        });
      }
    }
  }
  const selectedItem = decor?.selected ? home?.items.find((p) => p.key === decor.selected) : undefined;
  if (selectedItem && isFurniture(selectedItem.item)) {
    const { hw, hd } = footprint(selectedItem.item, selectedItem.turn);
    const at = cam.project([selectedItem.x, 0, selectedItem.z]);
    actors.push({
      depth: at.depth + 50,
      key: "item-ring",
      node: (
        <Ellipse cx={at.x} cy={at.y} rx={(hw + 0.3) * at.scale} ry={(hd + 0.3) * at.scale * 0.55} fill="transparent" ink={2.5} inkColour={garden.ring} dashed />
      ),
    });
  }
  people.forEach((p, i) => {
    const pose = poses[i];
    if (!pose) return;
    const seed = hash(p.memberId) % 7;
    const figure = figureFor(cam, pose);
    const seat = sitting[i];
    const seatRise = sitRise(seat?.height, p.look);
    const swimming = swimmers[i];
    const turned = { ...pose, heading: headings[i] };
    const striding = pose.strideAmp > 0;
    const stride = { stridePhase: striding ? pose.stridePhase : 0, strideAmp: pose.strideAmp };
    const touch = touches.find((c) => c.i === i || c.j === i);
    const planned = doing[i];
    const d: Doing =
      planned?.kind === "mutual" && touch
        ? { ...planned, reach: (({ x, y }) => ({ x, y }))(cam.project([touch.x, touch.y + figure.bob, touch.z])) }
        : planned;
    actors.push({
      depth: figure.foot.depth,
      key: p.memberId,
      // Only someone moving needs the clock; for the rest t stays 0, so their
      // memoized avatar isn't redrawn while others walk.
      node: p.away ? (
        <View style={[StyleSheet.absoluteFill, styles.away]} pointerEvents="none">
          <Avatar figure={figure} pose={turned} look={p.look} t={0} seed={seed} stride={stride} />
        </View>
      ) : (
        <Avatar figure={figure} pose={turned} look={p.look} t={pose.walking || d || (swimming && !saver) ? t : 0} seed={seed} stride={stride} sit={seat?.height} doing={d} swim={swimming} talk={talking[i]} />
      ),
    });
    const duelLook = duelLooks[i];
    const chant = duelLook?.chant ?? undefined;
    const line = chant ?? (bubbleFades[i] > 0 ? p.say?.text : undefined);
    // The icon over the head: the emote's, or the mutual action's when hands meet.
    const emote =
      d?.kind === "emote"
        ? EMOTES[d.id].icon
        : d?.kind === "mutual" && d.p > 0.4
          ? MUTUALS[d.id].icon
          : undefined;
    const rise = d?.kind === "emote" ? d.p : d?.kind === "mutual" ? (d.p - 0.4) / 0.6 : 0;
    // Your own open ask shows "High five?" over you until the other person
    // answers it (not only while the slap plays).
    const answeredMine =
      p.ask !== undefined && people.some((o) => o.memberId === p.ask?.to && accepted(o, p.memberId, p.ask.at));
    const waiting =
      p.me && p.ask && openAsk(p.ask, now) && !d && !answeredMine ? `${askInfo(p.ask.kind)?.ask ?? "…"}` : undefined;
    const head = cam.project([pose.x, headTop(p.look) + figure.bob + seatRise - (swimming ? swimSink(p.look) : 0), pose.z]);
    const name = p.me ? "You" : worldName(p.name);
    const typing = line || waiting ? undefined : typingSince[i];
    const speaking = Boolean(line || waiting || emote || p.away || p.reading || p.playing) || typing !== undefined;
    if (!tagShown({ mode: tagMode, me: p.me, distance: mine ? Math.hypot(pose.x - mine.x, pose.z - mine.z) : null, speaking })) return;
    actors.push({
      depth: figure.foot.depth,
      key: `${p.memberId}:tag`,
      tag: true,
      node: (
        <Tag
          x={head.x}
          y={head.y}
          name={name}
          me={p.me}
          stageWidth={cam.width}
          line={line ?? waiting}
          typing={typing === undefined ? undefined : saver ? 0 : t}
          emote={emote}
          emoteRise={rise}
          lineFade={line && !chant ? bubbleFades[i] : 1}
          status={p.away ? AWAY_STATUS : playingStatus(p.playing, pose, poses[people.findIndex((o) => o.memberId === p.playing?.with)])}
          reading={p.reading}
          shout={chant !== undefined && SHOUTS.has(chant)}
          calm={saver}
        />
      ),
    });
  });
  // The contact pop where palms meet: a quick burst while they touch.
  for (const c of touches) {
    if (c.k < 1) continue;
    const at = cam.project([c.x, c.y, c.z]);
    const a = poses[c.i];
    const b = poses[c.j];
    const front = Math.min(a ? cam.project([a.x, 0, a.z]).depth : at.depth, b ? cam.project([b.x, 0, b.z]).depth : at.depth);
    actors.push({ depth: front - 0.01, key: `touch-${c.i}-${c.j}`, node: <Spark x={at.x} y={at.y} size={at.scale * 0.55} t={saver ? 0 : t} /> });
  }
  // The tap marker: a spinning flower with a bobbing pin, until you arrive.
  if (target && placed && Math.hypot(placed.x - target.x, placed.z - target.z) > 0.05) {
    const base = cam.project([target.x, 0, target.z]);
    const pinLow = cam.project([target.x, 0.75, target.z]);
    const pinHigh = cam.project([target.x, 0.95, target.z]);
    actors.push({
      depth: base.depth,
      key: "marker",
      node: <Marker x={base.x} y={base.y} scale={base.scale} pinY={(pinLow.y + pinHigh.y) / 2} pinBob={(pinLow.y - pinHigh.y) / 2} calm={saver} />,
    });
  }
  const layered = layerOrder(actors);
  const targets: { key: string; label: string; x: number; y: number; onActivate: () => void }[] = [];
  people.forEach((p, i) => {
    const pose = poses[i];
    if (!pose || p.me) return;
    const at = cam.project([pose.x, 0.8, pose.z]);
    targets.push({ key: `a11y-${p.memberId}`, label: worldName(p.name), x: at.x, y: at.y, onActivate: () => onTapPerson(p.memberId) });
  });
  for (const pad of padSpots) {
    const at = cam.project([pad.x, 0, pad.z]);
    targets.push({ key: `a11y-pad-${pad.to}`, label: `Go to ${PLACE_TITLES[pad.to]}`, x: at.x, y: at.y, onActivate: () => {
      onHoldStart(pad.x, pad.z);
      onHoldEnd(pad.x, pad.z);
    } });
  }
  if (npcHere && onTapNpc) {
    const at = cam.project([NPC.x, 0.8, NPC.z]);
    targets.push({ key: "a11y-npc", label: `${NPC.name}, shop`, x: at.x, y: at.y, onActivate: onTapNpc });
  }
  if (farmerHere && onTapFarmer) {
    const at = cam.project([FARMER.x, 0.8, FARMER.z]);
    targets.push({ key: "a11y-farmer", label: `${FARMER.name}, farm shop`, x: at.x, y: at.y, onActivate: onTapFarmer });
  }
  const propTaps: [string, string, (() => void) | undefined][] = [
    ["arcade", "Arcade", onTapArcade],
    ["noticeboard", "Calendar board", onTapNoticeBoard],
    ["notices", "Notice board", onTapNotices],
    ["piano", "Piano, Praise List", onTapPiano],
    ["lectern", "Lectern, stand behind it", onTapLectern],
  ];
  for (const [id, label, onActivate] of propTaps) {
    const obs = PLACE_OBSTACLES[place].find((o) => o.id === id);
    if (!obs || !onActivate) continue;
    const at = cam.project([obs.x, 0.6, obs.z]);
    targets.push({ key: `a11y-${id}`, label, x: at.x, y: at.y, onActivate });
  }
  if (yard && pens && place === BACKYARD) {
    for (const id of BUILDING_IDS) {
      const pen = pens[id];
      if (!yard[id] && !yard.mine) continue;
      const label = yard[id] ? `${BUILDINGS[id].short}, ${yard.animals.filter((a) => a.kind === animalFor(id) && a.mood !== "gone").length} of ${BUILDINGS[id].capacity}` : `${BUILDINGS[id].short}, locked, ${BUILDINGS[id].price} coins`;
      targets.push({ key: `a11y-building-${id}`, label, x: pen.house.x, y: pen.house.y, onActivate: () => yard.onTapBuilding(id) });
      yard.animals.forEach((animal, i) => {
        if (animal.kind !== animalFor(id) || animal.mood === "gone") return;
        const at = pen.slots[i % pen.slots.length];
        targets.push({ key: `a11y-animal-${animal.id}`, label: animal.label, x: at.x, y: at.y, onActivate: () => yard.onTapAnimal(animal.id) });
      });
    }
  }
  if (farm && place === BACKYARD) {
    for (const spot of PLOTS) {
      const label = farm.describe(spot.index);
      if (!label) continue;
      const at = cam.project([spot.x, 0.3, spot.z]);
      targets.push({ key: `a11y-plot-${spot.index}`, label, x: at.x, y: at.y, onActivate: () => farm.onTapPlot(spot.index) });
    }
  }

  // You: not a button, but VoiceOver (and the verify checks) can read how you're placed.
  const myPose = me >= 0 ? poses[me] : null;
  const meAt = myPose ? cam.project([myPose.x, 0.8, myPose.z]) : null;
  const meLabel = myPose ? myPoseLabel(place, myPose, sitting[me] !== null) : null;

  const hudIndex = hudShown ? people.findIndex((p) => p.memberId === hudShown.id) : -1;
  const hudPose = hudIndex >= 0 ? poses[hudIndex] : null;
  const hudHead = hudPose
    ? cam.project([hudPose.x, headTop(people[hudIndex].look) + sitRise(sitting[hudIndex]?.height, people[hudIndex].look), hudPose.z])
    : null;
  const hudAt = hudHead ? { x: hudHead.x, y: Math.max(HUD_HEIGHT + HUD_CLEAR_TOP, hudHead.y - NAME_TAG_CLEARANCE) } : null;
  const itemProp = selectedItem ? scene.props.find((prop) => prop.tap === `${ITEM}${selectedItem.key}`) : undefined;
  const itemTop =
    itemProp && decor ? { x: (itemProp.box.left + itemProp.box.right) / 2, y: Math.max(HUD_HEIGHT + Math.max(HUD_CLEAR_TOP, decor.hudTop), itemProp.box.top - 8) } : null;

  return (
    <View style={[styles.fill, { backgroundColor: scene.sky }]} onLayout={onLayout}>
      {/* The ground takes taps; the asks sit beside it, not inside it, so
          on iOS a tap on an ask's button never reaches the ground. */}
      <View
        style={[StyleSheet.absoluteFill, noBrowserGestures]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // A walk in progress keeps the touch: nothing else (a scroll, a sheet) takes it.
        onResponderTerminationRequest={() => false}
        onResponderGrant={onGrant}
        onResponderMove={onMove}
        onResponderRelease={onRelease}
        onResponderTerminate={onCancel}
        testID="world-stage"
      >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Layer prims={scene.ground} />
        <Layer prims={scene.backdrop} />
        {padSpots.map((pad) => {
          const here = placeCounts?.[pad.to] ?? 0;
          const stoodOn = pad.up && poses.some((pose) => pose && !pose.walking && Math.hypot(pose.x - pad.x, pose.z - pad.z) <= PORTAL_RADIUS);
          return (
            <View
              key={`pad-${pad.to}`}
              style={[styles.padLabel, stoodOn ? pad.beside : { left: pad.left, top: pad.top }]}
              testID={stoodOn ? `world-pad-label-beside-${pad.to}` : undefined}
            >
              <Text style={styles.padLabelText} numberOfLines={1}>
                {here > 0 ? `${PLACE_TITLES[pad.to]} · ${here}` : PLACE_TITLES[pad.to]}
              </Text>
            </View>
          );
        })}
        {layered.map((a) => (
          <Fragment key={a.key}>{a.node}</Fragment>
        ))}
        {farmLabels}
      </View>
      </View>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {targets.map((target) => (
          <View
            key={target.key}
            pointerEvents="none"
            accessible
            accessibilityRole="button"
            accessibilityLabel={target.label}
            accessibilityActions={ACTIVATE}
            onAccessibilityAction={target.onActivate}
            style={[styles.target, { left: target.x - TARGET / 2, top: target.y - TARGET / 2 }]}
          />
        ))}
        {meAt && meLabel ? (
          <View
            pointerEvents="none"
            accessible
            accessibilityLabel={meLabel}
            testID="world-me"
            style={[styles.target, { left: meAt.x - TARGET / 2, top: meAt.y - TARGET / 2 }]}
          />
        ) : null}
        {asks.map((p, i) => {
          const pose = poses[people.indexOf(p)];
          if (!pose || !p.ask) return null;
          const head = cam.project([pose.x, headTop(p.look) + 0.9, pose.z]);
          // Asks from people standing together stack upward instead of
          // covering each other, and never leave the stage.
          const top = Math.max(8, head.y - 64 - promptOffset(asks, i, poses, people, cam));
          const left = Math.max(1 - (now - p.ask.at) / ASK_MS, 0);
          const info = askInfo(p.ask.kind);
          if (!info) return null;
          const askAt = p.ask.at;
          return (
            <View key={`ask-${p.memberId}`} style={[styles.ask, { left: Math.min(Math.max(4, head.x - ASK_CARD_WIDTH / 2), cam.width - ASK_CARD_WIDTH - 4), top }]} testID="world-ask">
              <Text style={styles.askText} numberOfLines={1}>
                {info.icon} {worldName(p.name)}: {info.ask}
              </Text>
              <View style={styles.askRow}>
                <Pressable
                  onPress={() => onAccept(p.memberId, askAt)}
                  accessibilityRole="button"
                  accessibilityLabel={`${info.label} with ${worldName(p.name)}`}
                  testID="world-ask-accept"
                  style={({ pressed }) => [styles.askYes, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.askYesText}>{info.label}!</Text>
                </Pressable>
                <Pressable
                  onPress={() => onDecline(p.memberId, askAt)}
                  accessibilityRole="button"
                  accessibilityLabel="Not now"
                  testID="world-ask-decline"
                  style={({ pressed }) => [styles.askNo, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.askNoText}>Not now</Text>
                </Pressable>
              </View>
              {/* Time left to answer. */}
              <View style={styles.askTrack}>
                <View style={[styles.askLeft, { width: `${left * 100}%` }]} />
              </View>
            </View>
          );
        })}
        {itemTop && decor && selectedItem ? (
          <PersonHud key={`item-${selectedItem.key}`} x={itemTop.x} y={itemTop.y} stageWidth={cam.width} visible actions={decor.actions} onHidden={() => undefined} />
        ) : null}
        {hudAt && hudShown ? (
          <PersonHud
            key={hudShown.id}
            x={hudAt.x}
            y={hudAt.y}
            stageWidth={cam.width}
            visible={liveHud !== null}
            actions={hudShown.actions}
            onHidden={() => setKeptHud(null)}
          />
        ) : null}
      </View>
    </View>
  );
};

const BUBBLE_IN_MS = 160;
const BUBBLE_OUT_MS = 400;
const bubbleFade = (age: number) =>
  age < 0 || age >= BUBBLE_MS ? 0 : Math.min(1, (age + 16) / BUBBLE_IN_MS, (BUBBLE_MS - age) / BUBBLE_OUT_MS);
const bubbleMoving = (age: number) => age < BUBBLE_IN_MS || (age > BUBBLE_MS - BUBBLE_OUT_MS - 1100 && age < BUBBLE_MS);

type Hit =
  | { kind: "person"; id: string }
  | { kind: "arcade" }
  | { kind: "noticeboard" }
  | { kind: "notices" }
  | { kind: "piano" }
  | { kind: "lectern" }
  | { kind: "seat"; id: string }
  | { kind: "npc" }
  | { kind: "farmer" }
  | { kind: "ball" }
  | { kind: "item"; key: string }
  | { kind: "plot"; index: number }
  | { kind: "animal"; id: string }
  | { kind: "building"; id: BuildingId }
  | { kind: "floor" }
  | { kind: "ground" };
const ITEM = "item:";
const TARGET = 44;
const ACTIVATE = [{ name: "activate" as const }];
const PLANT_HEIGHT = 1.6;
const PLANT_SCALE = 2.1;

const plotAtScreen = (cam: ReturnType<typeof makeCamera>, x: number, y: number): number | null => {
  const hits = PLOTS.filter((spot) => {
    const left = cam.project([spot.x - PLOT_SIZE.w / 2, 0, spot.z]).x;
    const right = cam.project([spot.x + PLOT_SIZE.w / 2, 0, spot.z]).x;
    const top = cam.project([spot.x, PLANT_HEIGHT, spot.z]).y;
    const bottom = cam.project([spot.x, 0, spot.z + PLOT_SIZE.d / 2]).y;
    return x >= left && x <= right && y >= top && y <= bottom;
  });
  return hits.sort((a, b) => b.z - a.z)[0]?.index ?? null;
};
type PenScreen = {
  corners: PenCorners;
  gate: { x: number; y: number; scale: number };
  exit: { x: number; y: number; scale: number };
  middle: { x: number; y: number; depth: number };
  top: { x: number; y: number };
  house: { x: number; y: number };
  box: { left: number; right: number; top: number; bottom: number };
  slots: { x: number; y: number }[];
};

const penScreens = (cam: ReturnType<typeof makeCamera>): Record<BuildingId, PenScreen> => {
  const one = (id: BuildingId): PenScreen => {
    const pen = PENS[id];
    const x0 = pen.x - pen.w / 2 + 0.25;
    const x1 = pen.x + pen.w / 2 - 0.25;
    const back = pen.back + 0.2;
    const front = pen.front - 0.25;
    const corners = { backLeft: cam.project([x0, 0, back]), backRight: cam.project([x1, 0, back]), frontLeft: cam.project([x0, 0, front]), frontRight: cam.project([x1, 0, front]) };
    const gate = cam.project([pen.x, 0, pen.front + 0.3]);
    const exit = cam.project([pen.x + (id === "coop" ? -4.6 : 4.6), 0, pen.front + 1.2]);
    const middle = cam.project([pen.x, 0, (pen.front + pen.back) / 2]);
    const top = cam.project([pen.house.x, 2.3, pen.house.z + pen.house.d / 2]);
    const house = cam.project([pen.house.x, 1.2, pen.house.z + pen.house.d / 2]);
    const left = cam.project([pen.x - pen.w / 2 - 0.1, 0, pen.front]).x;
    const right = cam.project([pen.x + pen.w / 2 + 0.1, 0, pen.front]).x;
    const slots = [0.25, 0.75].flatMap((v) => [0.25, 0.75].map((u) => penPoint(corners, u, v)));
    return {
      corners,
      gate,
      exit,
      middle: { x: middle.x, y: middle.y, depth: middle.depth },
      top: { x: top.x, y: top.y },
      house: { x: house.x, y: house.y },
      box: { left, right, top: cam.project([pen.house.x, 2.4, pen.house.z]).y, bottom: cam.project([pen.x, 0, pen.front + 0.15]).y },
      slots,
    };
  };
  return { coop: one("coop"), barn: one("barn") };
};

const yardAtScreen = (cam: ReturnType<typeof makeCamera>, pens: Record<BuildingId, PenScreen>, yard: GardenYard, x: number, y: number, live: boolean): Hit | null => {
  for (const id of BUILDING_IDS) {
    const pen = pens[id];
    const { box } = pen;
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
    if (!yard[id]) return yard.mine ? { kind: "building", id } : null;
    const phase = phaseFor(live, Date.now());
    let best: { id: string; d: number } | null = null;
    const here = yard.animals.filter((a) => buildingFor(a.kind) === id);
    for (const [slot, animal] of here.entries()) {
      if (animal.mood === "gone") continue;
      const at = animalAt(pen.corners, animal.id, animal.mood, phase, zoneOf(slot, Math.max(BUILDINGS[id].capacity, here.length)));
      const d = Math.hypot(at.x - x, at.y - 0.35 * at.scale - y);
      if (d <= ANIMAL_REACH * at.scale && (!best || d < best.d)) best = { id: animal.id, d };
    }
    return best ? { kind: "animal", id: best.id } : { kind: "building", id };
  }
  return null;
};

const ANIMAL_REACH = 1.1;

const NPC_POSE = { x: NPC.x, z: NPC.z, heading: NPC.heading, walking: false, arrivesAt: 0, stridePhase: 0, strideAmp: 0 };
const NPC_TAG = "☕ Sijin Y.";
const FARMER_POSE = { x: FARMER.x, z: FARMER.z, heading: FARMER.heading, walking: false, arrivesAt: 0, stridePhase: 0, strideAmp: 0 };
const FARMER_TAG = "🌱 Josh K.";
const FARMER_CHEER: Doing = { kind: "emote", id: "cheer", p: 0.5 };
const SEATED_WITHIN = 0.25;
const SHOUTS = new Set<string>(Object.values(DUEL_PICKS).map((pick) => pick.icon));
const AWAY_STATUS = "🕹️ Playing";
const PLAYING_SIDE_BY_SIDE = 2.5;

const playingStatus = (playing: PlayingTag | undefined, pose: { x: number; z: number }, theirs: { x: number; z: number } | null | undefined) => {
  if (!playing) return undefined;
  return theirs && Math.hypot(theirs.x - pose.x, theirs.z - pose.z) < PLAYING_SIDE_BY_SIDE ? playing.icon : playing.tag;
};
const PAD_LABEL_WIDTH = 132;
const PAD_LABEL_BESIDE_GAP = 8;
const PAD_LABEL_CLEAR_BOTTOM = 130;
const NAME_TAG_CLEARANCE = 30;
const HUD_CLEAR_TOP = 112;
/** An ask card's width (styles.ask), for keeping it on the stage. */
const ASK_CARD_WIDTH = 220;
/** Half the distance apart two people stand when their palms meet (world units). */
const TOUCH_HALF_GAP = 0.55;
/** How high the palms meet (world units). */
const palmsMeetAt = (a: Look, b: Look) => (palmHeight(a) + palmHeight(b)) / 2;

const BeachBall = ({ ball, cam, t }: { ball: RollingBall; cam: ReturnType<typeof makeCamera>; t: number }) => {
  const c = places.beach;
  const lift = ball.floating ? BALL_RADIUS * 0.45 + Math.sin(t * 2.4) * 0.02 : BALL_RADIUS;
  const centre = cam.project([ball.x, lift, ball.z]);
  const under = cam.project([ball.x, 0, ball.z]);
  const r = BALL_RADIUS * centre.scale;
  const turn = ball.travelled / BALL_RADIUS;
  const stripes = [c.ballRed, c.ball, c.ballBlue].map((colour, k) => {
    const phase = turn + (k * 2 * Math.PI) / 3;
    return { colour, k, front: Math.cos(phase), across: Math.sin(phase) };
  });
  return (
    <>
      {ball.floating ? (
        <Ellipse cx={under.x} cy={under.y} rx={r * 1.25} ry={r * 0.45} fill={c.foam} opacity={0.7} />
      ) : (
        <Ellipse cx={under.x - r * 0.15} cy={under.y} rx={r * 0.95} ry={r * 0.4} fill={garden.shadow} />
      )}
      <Ellipse cx={centre.x} cy={centre.y} rx={r} ry={r} fill={c.ballWhite} ink={Math.max(1.2, r * 0.12)} inkColour={garden.ink} />
      {stripes
        .filter((stripe) => stripe.front > 0)
        .map((stripe) => (
          <Ellipse
            key={`stripe${stripe.k}`}
            cx={centre.x + stripe.across * r * 0.5}
            cy={centre.y}
            rx={r * (0.12 + 0.24 * stripe.front)}
            ry={r * 0.82}
            fill={stripe.colour}
          />
        ))}
      <Ellipse cx={centre.x - r * 0.35} cy={centre.y - r * 0.4} rx={r * 0.22} ry={r * 0.15} fill={c.ballWhite} opacity={0.85} />
    </>
  );
};

/** A little star burst where two palms meet. */
const Spark = ({ x, y, size, t }: { x: number; y: number; size: number; t: number }) => {
  const pulse = 0.85 + 0.15 * Math.sin(t * 30);
  const rays = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => {
    const a = (n / 8) * Math.PI * 2;
    const r0 = size * 0.35 * pulse;
    const r1 = size * (n % 2 ? 0.7 : 0.95) * pulse;
    return { n, a: { x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 }, b: { x: x + Math.cos(a) * r1, y: y + Math.sin(a) * r1 } };
  });
  return (
    <>
      {rays.map((r) => (
        <Shape key={`ray${r.n}`} prim={{ kind: "line", key: `ray${r.n}`, a: r.a, b: r.b, width: Math.max(2, size * 0.09), colour: garden.markerMiddle }} />
      ))}
      <Ellipse cx={x} cy={y} rx={size * 0.22 * pulse} ry={size * 0.22 * pulse} fill={garden.ring} ink={1.5} inkColour={garden.markerMiddle} />
    </>
  );
};

/** Holding this long on a person or the arcade walks instead of opening them. */
const HOLD_TO_WALK_MS = 300;
/** A finger that moves this far (pixels) is dragging, not tapping. */
const TAP_SLOP = 10;
/**
 * On the web, a finger on the stage mustn't scroll or zoom the page, or
 * select text. react-native-web passes these through; React Native's types
 * don't list them.
 */
const noBrowserGestures = (Platform.OS === "web" ? { touchAction: "none", userSelect: "none" } : {}) as unknown as ViewStyle;

/** Height of an ask card, for stacking them. */
const PROMPT_HEIGHT = 128;

/** How far up the i-th ask card moves so it clears the ones before it. */
const promptOffset = (
  asks: GardenPerson[],
  i: number,
  poses: (DrawnPose | null)[],
  people: GardenPerson[],
  cam: ReturnType<typeof makeCamera>
) => {
  const at = (p: GardenPerson) => {
    const pose = poses[people.indexOf(p)];
    return pose ? cam.project([pose.x, headTop(p.look) + 0.9, pose.z]) : null;
  };
  const me = at(asks[i]);
  if (!me) return 0;
  let lift = 0;
  for (let j = 0; j < i; j++) {
    const other = at(asks[j]);
    if (other && Math.abs(other.x - me.x) < 220 && Math.abs(other.y - me.y) < PROMPT_HEIGHT + lift) lift += PROMPT_HEIGHT;
  }
  return lift;
};

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: "hidden" },
  away: { opacity: 0.45 },
  padLabel: { position: "absolute", width: PAD_LABEL_WIDTH, alignItems: "center" },
  target: { position: "absolute", width: TARGET, height: TARGET },
  padLabelText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: places.padLabelText,
    backgroundColor: places.padLabel,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  ask: {
    position: "absolute",
    width: ASK_CARD_WIDTH,
    gap: 8,
    padding: 10,
    borderRadius: 18,
    backgroundColor: hud.card,
    borderWidth: 2.5,
    borderColor: hud.forest,
    ...popShadow(),
  },
  askText: { color: hud.forest, fontSize: 14.5, fontWeight: "700", textAlign: "center" },
  askRow: { flexDirection: "row", gap: 8 },
  askYes: { flex: 1, backgroundColor: hud.accent, borderRadius: 999, paddingVertical: 8, alignItems: "center", borderWidth: 2, borderColor: hud.forest },
  askYesText: { color: hud.onAccent, fontWeight: "700", fontSize: 14 },
  askNo: { flex: 1, backgroundColor: hud.primarySoft, borderRadius: 999, paddingVertical: 8, alignItems: "center", borderWidth: 2, borderColor: "transparent" },
  askNoText: { color: hud.forest, fontWeight: "600", fontSize: 14 },
  askTrack: { height: 4, borderRadius: 2, backgroundColor: hud.primarySoft, overflow: "hidden" },
  askLeft: { height: 4, backgroundColor: hud.accent },
});
