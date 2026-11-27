import { v } from "convex/values";
import { FAAN, type FaanId } from "../shared/mahjong/faan";

export const mahjongSeatValidator = v.union(
  v.object({ kind: v.literal("empty") }),
  v.object({ kind: v.literal("human"), email: v.string(), name: v.string(), away: v.optional(v.number()), ready: v.optional(v.boolean()) }),
  v.object({ kind: v.literal("bot"), name: v.string() })
);

export const mahjongSettingsValidator = v.object({ minFaan: v.number(), maxFaan: v.number(), flowers: v.boolean(), stake: v.number(), coins: v.optional(v.boolean()) });

export const mahjongPhaseValidator = v.union(v.literal("lobby"), v.literal("playing"), v.literal("ended"));

const meldType = v.union(v.literal("chow"), v.literal("pong"), v.literal("kong"));

const meldValidator = v.object({
  type: meldType,
  kind: v.number(),
  tiles: v.array(v.number()),
  concealed: v.optional(v.boolean()),
  from: v.optional(v.number()),
  claimed: v.optional(v.number()),
});

const discardValidator = v.object({ tile: v.number(), taken: v.optional(v.boolean()) });

const seatHandValidator = v.object({
  hand: v.array(v.number()),
  melds: v.array(meldValidator),
  flowers: v.array(v.number()),
  discards: v.array(discardValidator),
  turns: v.number(),
});

const offerValidator = v.object({ hu: v.boolean(), pong: v.boolean(), kong: v.boolean(), chows: v.array(v.array(v.number())) });

export const mahjongAnswerValidator = v.union(
  v.object({ kind: v.literal("pass") }),
  v.object({ kind: v.literal("hu") }),
  v.object({ kind: v.literal("pong") }),
  v.object({ kind: v.literal("kong") }),
  v.object({ kind: v.literal("chow"), option: v.number() })
);

const FAAN_IDS = Object.keys(FAAN) as FaanId[];
const faanLineValidator = v.object({ id: v.union(...FAAN_IDS.map((id) => v.literal(id))), faan: v.number() });
const payValidator = v.object({ from: v.number(), to: v.number(), points: v.number() });

export const mahjongResultValidator = v.union(
  v.object({
    kind: v.literal("win"),
    winner: v.number(),
    from: v.union(v.number(), v.null()),
    tile: v.number(),
    lines: v.array(faanLineValidator),
    faan: v.number(),
    points: v.number(),
    pays: v.array(payValidator),
    hand: v.array(v.number()),
  }),
  v.object({ kind: v.literal("draw") })
);

const stageValidator = v.union(
  v.object({ kind: v.literal("intro"), until: v.number() }),
  v.object({ kind: v.literal("turn"), seat: v.number(), drawn: v.union(v.number(), v.null()), deadline: v.number(), replacement: v.boolean(), claimed: v.boolean() }),
  v.object({
    kind: v.literal("claim"),
    from: v.number(),
    tile: v.number(),
    deadline: v.number(),
    rob: v.boolean(),
    offers: v.array(v.union(offerValidator, v.null())),
    answers: v.array(v.union(mahjongAnswerValidator, v.null())),
  }),
  v.object({ kind: v.literal("over"), result: mahjongResultValidator })
);

const eventValidator = v.object({
  kind: v.union(v.literal("deal"), v.literal("draw"), v.literal("discard"), v.literal("chow"), v.literal("pong"), v.literal("kong"), v.literal("hu"), v.literal("drawn")),
  seat: v.number(),
  tile: v.optional(v.number()),
  step: v.number(),
});

export const mahjongHandValidator = v.object({
  step: v.number(),
  wall: v.array(v.number()),
  seats: v.array(seatHandValidator),
  dealer: v.number(),
  roundWind: v.number(),
  dice: v.array(v.number()),
  breakAt: v.number(),
  settings: mahjongSettingsValidator,
  stage: stageValidator,
  last: v.union(eventValidator, v.null()),
  calls: v.number(),
});

export const mahjongMoveValidator = v.union(
  v.object({ kind: v.literal("discard"), tile: v.number() }),
  v.object({ kind: v.literal("win") }),
  v.object({ kind: v.literal("kong"), tileKind: v.number() }),
  v.object({ kind: v.literal("answer"), answer: mahjongAnswerValidator })
);

/** What a phone gets of a hand (shared/mahjong/view.ts): never the wall, and concealed tiles only its own. */
const meldViewValidator = v.object({
  type: meldType,
  tiles: v.array(v.number()),
  concealed: v.boolean(),
  from: v.union(v.number(), v.null()),
  claimed: v.union(v.number(), v.null()),
});

export const mahjongHandViewValidator = v.object({
  step: v.number(),
  dealer: v.number(),
  roundWind: v.number(),
  dice: v.array(v.number()),
  breakAt: v.number(),
  wallLeft: v.number(),
  seats: v.array(
    v.object({
      wind: v.number(),
      concealed: v.number(),
      hand: v.union(v.array(v.number()), v.null()),
      melds: v.array(meldViewValidator),
      flowers: v.array(v.number()),
      discards: v.array(discardValidator),
    })
  ),
  stage: v.union(
    v.object({ kind: v.literal("intro"), until: v.number() }),
    v.object({ kind: v.literal("turn"), seat: v.number(), deadline: v.number(), claimed: v.boolean() }),
    v.object({ kind: v.literal("claim"), from: v.number(), tile: v.number(), deadline: v.number(), rob: v.boolean() }),
    v.object({ kind: v.literal("over"), result: mahjongResultValidator })
  ),
  last: v.union(eventValidator, v.null()),
  mine: v.union(
    v.null(),
    v.object({
      drawn: v.union(v.number(), v.null()),
      win: v.union(v.null(), v.object({ faan: v.number() })),
      kongs: v.array(v.number()),
      offer: v.union(offerValidator, v.null()),
      answered: v.boolean(),
    })
  ),
});

export const mahjongSettledValidator = v.object({ deltas: v.array(v.number()), fromBank: v.array(v.number()) });
