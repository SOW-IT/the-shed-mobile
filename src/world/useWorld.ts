import {
  ASK_MS,
  CHAT_LOG_SIZE,
  clampTarget,
  cleanLine,
  fullBucket,
  isPlace,
  seatIn,
  takeToken,
  type Place,
  type Look,
  type Ask,
  type Reply,
  HEARTBEAT_IDLE_MS,
  addPingSample,
  pingBars,
  pingEstimate,
  PING_PROBE_MS,
  pingProbeDue,
  pingProbeWait,
  shouldPublishPing,
  shownPing,
  type PingReading,
  type PingBars,
  TYPING_REFRESH_MS,
  posAt,
  type Walk,
} from "@shared/world";
import { findPath } from "@shared/worldPath";
import { homeObstacles } from "@shared/home";
import { BALL_PLACE, KICK_GAP_MS, kickBall, kickDirection, restingBall } from "@shared/ball";
import { useConvex, useMutation, useQueries, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "../../convex/_generated/api";
import { useHeldValue } from "@/hooks/useHeldValue";
import { fillLoading, useDormant } from "./dormant";
import { blendIn, headFor, type LocalWalk } from "./blend";
import { restingGait, type Gait } from "./gait";
import { subscribeForeground } from "./useForeground";
import type { Id } from "../../convex/_generated/dataModel";

type MemberId = Id<"worldMembers">;
type StateRow = NonNullable<FunctionReturnType<typeof api.world.state>>;
type Session = { roomId: Id<"worldRooms">; memberId: MemberId; instance: number; place: Place };

const placeFrom = (value: string): Place => (isPlace(value) ? value : "garden");

const pingVisitKey = (session: Session) => `${session.memberId}:${session.roomId}`;

export type WorldMember = {
  memberId: MemberId;
  name: string;
  look: Look;
  isMe: boolean;
  walk: Walk | null;
  gait?: Gait;
  say?: { text: string; at: number };
  act?: { emote: string; at: number };
  ask?: Ask;
  reply?: Reply;
  /** The asks this person accepted that are still open. */
  answered?: Reply[];
  away?: "arcade";
  playing?: string;
  reading?: boolean;
  seat?: string;
  typing?: number;
  ping?: number;
};

/** The id prefix of a chat line shown before the server has it. */
export const PENDING = "pending:";

/** Taps closer together than this send only the last one. */
const COALESCE_MS = 150;
const HOLD_ROUTE_MS = 100;
const HOLD_SAME_SPOT = 0.3;
/**
 * Counts of what this phone sent, for measuring the write budget. Tests and
 * the verify run read it from `globalThis.__shedWorld`.
 */
type WorldStats = {
  join: number;
  move: number;
  moveRefused: number;
  act: number;
  say: number;
  ask: number;
  accept: number;
  saveLook: number;
  heartbeat: number;
  ping: number;
  probe: number;
  kick: number;
  leave: number;
  since: number;
};
const newStats = (): WorldStats => ({
  join: 0,
  move: 0,
  moveRefused: 0,
  act: 0,
  say: 0,
  ask: 0,
  accept: 0,
  saveLook: 0,
  heartbeat: 0,
  ping: 0,
  probe: 0,
  kick: 0,
  leave: 0,
  since: Date.now(),
});

/** Why an ask or an accept was turned away, in words. */
const turnedAwayText = (reply: { reason?: string; retryInMs?: number }) =>
  reply.retryInMs !== undefined
    ? `Slow down a little. Try again in ${Math.ceil(reply.retryInMs / 1000)}s.`
    : (reply.reason ?? "That didn't work.");

const leftGarden = (e: unknown) => e instanceof ConvexError && /left the garden/.test(String(e.data));

/**
 * Optimistic updates: every action shows at once on this phone, before the
 * server answers. Convex drops each one when its mutation's answer arrives,
 * so the server's own copy replaces it (never a duplicate) and a refusal or
 * failure rolls it back by itself.
 */
let serverOffset = 0;
const clock = () => Date.now() + serverOffset;

/** You, as the roster this phone already holds knows you. */
const meIn = (store: OptimisticLocalStore) => {
  for (const { args, value } of store.getAllQueries(api.world.roster)) {
    const me = value?.members.find((m) => m.isMe);
    if (me) return { roomId: args.roomId, memberId: me.memberId, name: me.name };
  }
  return null;
};

const patchMine = (store: OptimisticLocalStore, change: (row: StateRow) => StateRow) => {
  const me = meIn(store);
  const row = me && store.getQuery(api.world.state, { memberId: me.memberId });
  if (me && row) store.setQuery(api.world.state, { memberId: me.memberId }, change(row));
};

const showKick = (store: OptimisticLocalStore, { dirX, dirZ }: { dirX: number; dirZ: number }) => {
  const me = meIn(store);
  const current = me && store.getQuery(api.world.ball, { roomId: me.roomId });
  if (!me || current === undefined) return;
  const now = clock();
  if (current && now - current.at < KICK_GAP_MS) return;
  const origin = { x: 0, z: 0 };
  store.setQuery(api.world.ball, { roomId: me.roomId }, kickBall(current ?? restingBall(), kickDirection(origin, origin, { x: dirX, z: dirZ }), now));
};

const showEmote = (store: OptimisticLocalStore, { emote }: { emote: string }) =>
  patchMine(store, (row) => ({ ...row, act: { emote, at: clock() } }));

const showLine = (store: OptimisticLocalStore, { text }: { text: string }) => {
  const me = meIn(store);
  const line = cleanLine(text);
  if (!me || !line) return;
  const at = clock();
  patchMine(store, (row) => ({ ...row, say: { text: line, at }, typing: undefined }));
  const pending = { id: `${PENDING}${at}` as Id<"worldChat">, memberId: me.memberId, name: me.name, text: line, at, isMe: true, place: undefined, here: true, kind: undefined };
  for (const { args, value } of store.getAllQueries(api.world.chatLog)) {
    if (args.roomId !== me.roomId || args.before !== undefined || !value) continue;
    store.setQuery(api.world.chatLog, args, [pending, ...value].slice(0, args.limit ?? CHAT_LOG_SIZE));
  }
};

const showAsk = (store: OptimisticLocalStore, { to, kind }: { to: MemberId; kind: string }) =>
  patchMine(store, (row) => ({ ...row, ask: { kind, to, at: clock() } }));

const showAccept = (store: OptimisticLocalStore, { from, askAt }: { from: MemberId; askAt: number }) => {
  const asker = store.getQuery(api.world.state, { memberId: from });
  if (!asker?.ask || asker.ask.at !== askAt) return;
  const kind = asker.ask.kind;
  // The high five starts here, as soon as this phone knows both agreed.
  patchMine(store, (row) => {
    const reply = { kind, to: from, askAt, at: clock() };
    return { ...row, reply, answered: [...(row.answered ?? []), reply] };
  });
};

const showLook = (store: OptimisticLocalStore, { look }: { look: Look }) => {
  const me = meIn(store);
  const roster = me && store.getQuery(api.world.roster, { roomId: me.roomId });
  if (!me || !roster) return;
  store.setQuery(api.world.roster, { roomId: me.roomId }, {
    ...roster,
    members: roster.members.map((m) => (m.memberId === me.memberId ? { ...m, look } : m)),
  });
};

/**
 * Being in the garden: joins on open, leaves on close or when the app goes
 * to the background, and keeps every write to one per action. Positions are
 * never sent per frame; each phone walks people along their latest walk.
 */
const NO_OBSTACLES: ReturnType<typeof homeObstacles> = [];
const PING_RECHECK_MS = 1000;
const NO_MEMBERS: NonNullable<FunctionReturnType<typeof api.world.roster>>["members"] = [];
const NO_REQUESTS = {};

type States = ReturnType<typeof useQueries>;

const stillLoading = (states: States) => Object.values(states).some((row) => row === undefined);

const useHeldStates = (live: States, dormant: boolean, visitKey: string): States => {
  const settled = useHeldValue(dormant || stillLoading(live) ? undefined : live, visitKey).value;
  return dormant ? (settled ?? live) : fillLoading(live, settled);
};

export const useWorld = (
  enabled: boolean,
  away = false,
  arrival?: { poke?: string; invite?: string },
  tickEverySecond = true,
  reading = false,
  game?: string
) => {
  const convex = useConvex();
  const joinM = useMutation(api.world.join);
  const leaveM = useMutation(api.world.leave);
  const moveM = useMutation(api.world.move);
  const heartbeatM = useMutation(api.world.heartbeat);
  const awayM = useMutation(api.world.away);
  const readingM = useMutation(api.world.reading);
  const travelM = useMutation(api.world.travel);
  const sitM = useMutation(api.world.sit);
  const typingM = useMutation(api.world.typing);
  const pingM = useMutation(api.world.ping);
  const [mySeat, setMySeat] = useState<string | null>(null);
  const travelling = useRef(false);
  // Every action shows at once on this phone (optimistic updates, below),
  // before the server answers.
  const actM = useMutation(api.world.act).withOptimisticUpdate(showEmote);
  const sayM = useMutation(api.world.say).withOptimisticUpdate(showLine);
  const askM = useMutation(api.world.ask).withOptimisticUpdate(showAsk);
  const acceptM = useMutation(api.world.accept).withOptimisticUpdate(showAccept);
  const saveLookM = useMutation(api.world.saveLook).withOptimisticUpdate(showLook);
  // Server time minus this phone's, smoothed over replies.
  const offset = useRef<number | null>(null);

  const [session, setSession] = useState<Session | null>(null);
  const dormant = useDormant();
  const visitKey = session ? `${session.roomId}:${session.memberId}` : "";
  const arrivalRef = useRef(arrival);
  const home = useHeldValue(useQuery(api.worldHome.home, session?.place === "home" && !dormant ? { roomId: session.roomId } : "skip"), visitKey).value;
  const obstacles = useMemo(() => (home ? homeObstacles(home.items) : NO_OBSTACLES), [home]);
  const obstaclesRef = useRef(obstacles);
  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);
  const [error, setError] = useState<string | null>(null);
  const [rejoin, setRejoin] = useState(0);
  const [arrivalSeen, setArrivalSeen] = useState(arrival);
  if (arrival !== arrivalSeen) {
    setArrivalSeen(arrival);
    if (arrival) setRejoin((n) => n + 1);
  }
  useEffect(() => {
    if (arrival) arrivalRef.current = arrival;
  }, [arrival]);
  // Your own walk, ahead of the server so a tap moves you at once.
  const [myWalk, setMyWalk] = useState<LocalWalk | null>(null);
  const myWalkRef = useRef<LocalWalk | null>(null);
  useEffect(() => {
    myWalkRef.current = myWalk;
  }, [myWalk]);
  const [target, setTarget] = useState<{ x: number; z: number } | null>(null);
  const stats = useRef<WorldStats>(newStats());

  const lastAction = useRef(0);
  // The spot waiting to be sent, whether a move is on its way, and its timer.
  const pending = useRef<{ x: number; z: number; seat?: string } | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped when a visit ends, so a reply from the last visit can't queue a move in this one.
  const visit = useRef(0);
  // True from a tap until the server answers it: our own walk is a
  // prediction until then, and the server's may be older than it.
  const predicting = useRef(false);
  // A finger down on the ground: the walk follows it locally every frame,
  // and the last spot sent (and when) throttles the writes.
  const holding = useRef(false);
  const holdFrame = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The finger's latest spot, for the send that ends a throttle window.
  const fingerAt = useRef<{ x: number; z: number } | null>(null);

  const serverNow = useCallback(() => Date.now() + (offset.current ?? 0), []);
  const [pingReading, setPingReading] = useState<PingReading | null>(null);
  const pingVisit = useRef<{ key: string } | null>(null);
  const pingSamples = useRef<number[]>([]);
  const probedAt = useRef<number | null>(null);
  const probing = useRef(false);
  const publishedPing = useRef<{ bars: PingBars | null; at: number | null }>({ bars: null, at: null });
  const publishing = useRef(false);
  const heard = useCallback((serverTime: number, sentAt: number) => {
    const received = Date.now();
    const sample = serverTime - (sentAt + received) / 2;
    offset.current = offset.current === null ? sample : offset.current * 0.8 + sample * 0.2;
    serverOffset = offset.current;
    lastAction.current = received;
  }, []);

  useEffect(() => {
    (globalThis as { __shedWorld?: WorldStats }).__shedWorld = stats.current;
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const sentAt = Date.now();
    const counts = stats.current;
    counts.join++;
    lastAction.current = sentAt;
    const asked = arrivalRef.current;
    arrivalRef.current = undefined;
    joinM(asked ?? {})
      .then((joined) => {
        if (cancelled) return;
        heard(joined.serverNow, sentAt);
        publishedPing.current = { bars: null, at: null };
        setSession({ roomId: joined.roomId, memberId: joined.memberId, instance: joined.instance, place: placeFrom(joined.place) });
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        arrivalRef.current ??= asked;
        setError(e instanceof ConvexError ? String(e.data) : "Couldn't open the garden.");
      });
    return () => {
      cancelled = true;
      setSession(null);
      // Nothing queued in this visit goes out in the next.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a counter of visits, not a rendered node; bumping it at cleanup is the point
      visit.current++;
      pending.current = null;
      predicting.current = false;
      holding.current = false;
      if (holdFrame.current !== null) clearTimeout(holdFrame.current);
      holdFrame.current = null;
      // The next visit starts from its own spawn walk, not this one's.
      setMyWalk(null);
      setTarget(null);
      setMySeat(null);
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      counts.leave++;
      leaveM({}).catch(() => undefined);
    };
  }, [enabled, rejoin, joinM, leaveM, heard]);

  const again = useCallback(() => setRejoin((n) => n + 1), []);

  const toldAway = useRef(false);
  useEffect(() => {
    if (!session || (!away && !toldAway.current)) return;
    toldAway.current = away;
    let stillWanted = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const tell = () => {
      awayM(away ? { at: "arcade", ...(game === undefined ? {} : { game }) } : { at: null })
        .then((reply) => {
          if (stillWanted && !reply.ok) retry = setTimeout(tell, reply.retryInMs);
        })
        .catch(() => undefined);
    };
    tell();
    return () => {
      stillWanted = false;
      if (retry) clearTimeout(retry);
    };
  }, [session, away, game, awayM]);

  const toldReading = useRef(false);
  useEffect(() => {
    if (!session || (!reading && !toldReading.current)) return;
    toldReading.current = reading;
    readingM({ on: reading }).catch(() => undefined);
  }, [session, reading, readingM]);
  const stillReading = useCallback(() => {
    if (toldReading.current) readingM({ on: true }).catch(() => undefined);
  }, [readingM]);

  const actTokens = useRef(fullBucket("act", 0));
  const spendAct = useCallback(() => {
    const taken = takeToken("act", actTokens.current, Date.now());
    if (taken.ok) actTokens.current = taken.bucket;
    return taken;
  }, []);

  const roster = useHeldValue(useQuery(api.world.roster, session && !dormant ? { roomId: session.roomId } : "skip"), visitKey).value;
  // Swept while away (a long background, a lost signal): come back in.
  useEffect(() => {
    if (session && roster === null && !travelling.current) again();
  }, [session, roster, again]);

  const members = roster?.members ?? NO_MEMBERS;

  // One subscription per person, keyed on who's here so it changes only on join and leave.
  const memberKey = members.map((m) => m.memberId).join(",");
  const requests = useMemo(
    () =>
      Object.fromEntries(
        (memberKey ? (memberKey.split(",") as MemberId[]) : []).map((memberId) => [
          memberId,
          { query: api.world.state, args: { memberId } },
        ])
      ),
    [memberKey]
  );
  const states = useHeldStates(useQueries(dormant ? NO_REQUESTS : requests), dormant, visitKey);

  const myRow = session ? states[session.memberId] : undefined;
  const myServerWalk = myRow && !(myRow instanceof Error) ? (myRow as Walk) : null;
  const myServerWalkRef = useRef(myServerWalk);
  useEffect(() => {
    myServerWalkRef.current = myServerWalk;
  }, [myServerWalk]);
  useEffect(() => {
    // Adopt the server's walk when it's newer than ours (another device, or the first load).
    // While a tap is unanswered, only a walk well after ours (another device)
    // replaces the prediction; otherwise any newer walk from the server does.
    const gap = predicting.current ? 1000 : 0;
    if (myServerWalk && (!myWalk || myServerWalk.startedAt > myWalk.startedAt + gap)) {
      const now = serverNow();
      setMyWalk((walk) => blendIn(walk, myServerWalk, now));
      setMySeat((myServerWalk as { seat?: string }).seat ?? null);
    }
  }, [myServerWalk, myWalk, serverNow]);

  const flushRef = useRef<() => void>(() => undefined);
  const later = useCallback((ms: number) => {
    // Only the latest flush may run, so a newer tap can still cancel it.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flushRef.current(), ms);
  }, []);

  const flush = useCallback(() => {
    timer.current = null;
    if (travelling.current) {
      pending.current = null;
      return;
    }
    const to = pending.current;
    if (!to || inFlight.current) return;
    pending.current = null;
    const place = session?.place;
    const serverWalk = myServerWalkRef.current;
    const path =
      place && serverWalk
        ? findPath(place, posAt(serverWalk, serverNow()), to, obstaclesRef.current, { allowGoalInside: to.seat !== undefined })
        : [];
    if (!path) {
      predicting.current = false;
      return;
    }
    inFlight.current = true;
    const sentAt = Date.now();
    const sentIn = visit.current;
    stats.current.move++;
    const pathArg = path.length > 0 ? { path } : {};
    (to.seat ? sitM({ seat: to.seat, ...pathArg }) : moveM({ toX: to.x, toZ: to.z, ...pathArg }))
      .then((reply) => {
        if (sentIn !== visit.current) return;
        heard(reply.serverNow, sentAt);
        if (reply.ok) {
          stillReading();
          const { fromX, fromZ, toX, toZ, startedAt, path: route } = reply;
          // While a finger is down the local walk leads; adopt the server's after release.
          if (!pending.current && !holding.current) {
            const now = serverNow();
            setMyWalk((walk) => blendIn(walk, { fromX, fromZ, toX, toZ, startedAt, path: route }, now));
            predicting.current = false;
          }
        } else {
          // Turned away by the rate limit: send the latest spot once a token is back.
          stats.current.moveRefused++;
          pending.current ??= to;
          later(reply.retryInMs);
        }
      })
      .catch((e: unknown) => {
        if (!pending.current) predicting.current = false;
        if (leftGarden(e)) again();
      })
      .finally(() => {
        inFlight.current = false;
        if (sentIn === visit.current && pending.current && !timer.current) later(COALESCE_MS);
      });
  }, [session, moveM, sitM, heard, again, later, serverNow, stillReading]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const walkTo = useCallback(
    (x: number, z: number) => {
      if (!session) return;
      const to = clampTarget(x, z, session.place, obstaclesRef.current);
      const now = serverNow();
      const from = myWalkRef.current ? posAt(myWalkRef.current, now) : to;
      const path = findPath(session.place, from, to, obstaclesRef.current);
      if (!path) return;
      const next = headFor(myWalkRef.current, to, now, path);
      myWalkRef.current = next;
      setMyWalk(next);
      setTarget(to);
      setMySeat(null);
      pending.current = to;
      predicting.current = true;
      lastAction.current = Date.now();
      if (timer.current) clearTimeout(timer.current);
      later(COALESCE_MS);
    },
    [session, serverNow, later]
  );

  const sitOn = useCallback(
    (seatId: string) => {
      const seat = session && seatIn(session.place, seatId);
      if (!seat || !session) return;
      const now = serverNow();
      const from = myWalkRef.current ? posAt(myWalkRef.current, now) : seat;
      const path = findPath(session.place, from, seat, obstaclesRef.current, { allowGoalInside: true });
      if (!path) return;
      const next = headFor(myWalkRef.current, seat, now, path);
      myWalkRef.current = next;
      setMyWalk(next);
      setTarget(null);
      setMySeat(seat.id);
      pending.current = { x: seat.x, z: seat.z, seat: seat.id };
      predicting.current = true;
      lastAction.current = Date.now();
      if (timer.current) clearTimeout(timer.current);
      later(COALESCE_MS);
    },
    [session, serverNow, later]
  );

  /** Points your walk at a spot now, from wherever you are on the way. */
  const retarget = useCallback(
    (to: { x: number; z: number }): boolean => {
      fingerAt.current = to;
      const walk = myWalkRef.current;
      if (walk && Math.hypot(walk.toX - to.x, walk.toZ - to.z) < HOLD_SAME_SPOT) return true;
      const now = serverNow();
      const from = walk ? posAt(walk, now) : to;
      const path = session ? findPath(session.place, from, to, obstaclesRef.current) : [];
      if (!path) return false;
      const next = headFor(walk, to, now, path);
      myWalkRef.current = next;
      setMyWalk(next);
      setTarget(to);
      return true;
    },
    [session, serverNow]
  );

  /** Sends a move for this spot now (or as soon as the one on its way is answered). */
  const sendNow = useCallback(
    (to: { x: number; z: number }) => {
      pending.current = to;
      predicting.current = true;
      lastAction.current = Date.now();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      flushRef.current();
    },
    []
  );

  const holdStart = useCallback(
    (x: number, z: number) => {
      if (!session) return;
      holding.current = true;
      predicting.current = true;
      setMySeat(null);
      retarget(clampTarget(x, z, session.place, obstaclesRef.current));
    },
    [session, retarget]
  );

  const holdMove = useCallback(
    (x: number, z: number) => {
      if (!session || !holding.current) return;
      fingerAt.current = clampTarget(x, z, session.place, obstaclesRef.current);
      if (holdFrame.current !== null) return;
      holdFrame.current = setTimeout(() => {
        holdFrame.current = null;
        if (holding.current && fingerAt.current) retarget(fingerAt.current);
      }, HOLD_ROUTE_MS);
    },
    [session, retarget]
  );

  const holdEnd = useCallback(
    (x: number, z: number) => {
      if (!session || !holding.current) return;
      holding.current = false;
      if (holdFrame.current !== null) clearTimeout(holdFrame.current);
      holdFrame.current = null;
      const to = clampTarget(x, z, session.place, obstaclesRef.current);
      const walk = myWalkRef.current;
      const reachable = retarget(to);
      if (reachable) sendNow(to);
      else if (walk) sendNow({ x: walk.toX, z: walk.toZ });
    },
    [session, retarget, sendNow]
  );

  const typingSentAt = useRef<number | null>(null);
  const say = useCallback(
    async (text: string): Promise<string | null> => {
      typingSentAt.current = null;
      const sentAt = Date.now();
      stats.current.say++;
      try {
        const reply = await sayM({ text });
        heard(reply.serverNow, sentAt);
        if (!reply.ok) typingM({ on: false }).catch(() => undefined);
        return reply.ok ? null : `Slow down a little. Try again in ${Math.ceil(reply.retryInMs / 1000)}s.`;
      } catch (e) {
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [sayM, typingM, heard, again]
  );

  const act = useCallback(
    async (emote: string): Promise<string | null> => {
      const token = spendAct();
      if (!token.ok) return turnedAwayText(token);
      const sentAt = Date.now();
      stats.current.act++;
      try {
        const reply = await actM({ emote });
        heard(reply.serverNow, sentAt);
        return reply.ok ? null : turnedAwayText(reply);
      } catch (e) {
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [actM, heard, again, spendAct]
  );

  /** Asks someone for a mutual action. Says why not, or null when it's asked. */
  const ask = useCallback(
    async (to: MemberId, kind: string): Promise<string | null> => {
      spendAct();
      const sentAt = Date.now();
      stats.current.ask++;
      try {
        const reply = await askM({ to, kind });
        heard(reply.serverNow, sentAt);
        if (reply.ok) return null;
        return turnedAwayText(reply);
      } catch (e) {
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [askM, heard, again, spendAct]
  );

  const accept = useCallback(
    async (from: MemberId, askAt: number): Promise<string | null> => {
      spendAct();
      const sentAt = Date.now();
      stats.current.accept++;
      try {
        const reply = await acceptM({ from, askAt });
        heard(reply.serverNow, sentAt);
        if (reply.ok) return null;
        return turnedAwayText(reply);
      } catch (e) {
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [acceptM, heard, again, spendAct]
  );

  const travel = useCallback(
    async (to: Place, { toMember, invite }: { toMember?: MemberId; invite?: Id<"worldInvites"> } = {}): Promise<string | null> => {
      if (!session || travelling.current) return null;
      travelling.current = true;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const sentAt = Date.now();
      const sentIn = visit.current;
      try {
        const reply = await travelM({ to, ...(toMember ? { toMember } : {}), ...(invite ? { invite } : {}) });
        if (sentIn !== visit.current) return null;
        heard(reply.serverNow, sentAt);
        if (!reply.ok) return turnedAwayText(reply);
        spendAct();
        pending.current = null;
        predicting.current = false;
        holding.current = false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        const { fromX, fromZ, toX, toZ, startedAt, heading } = reply;
        const arrived: Walk = { fromX, fromZ, toX, toZ, startedAt, ...(heading === undefined ? {} : { heading }) };
        setMyWalk({ ...arrived, gait: restingGait(arrived) });
        setTarget(null);
        setMySeat(null);
        setSession({ roomId: reply.roomId, memberId: session.memberId, instance: reply.instance, place: placeFrom(reply.place) });
        return null;
      } catch (e) {
        if (sentIn !== visit.current) return null;
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "Couldn't get there.";
      } finally {
        travelling.current = false;
      }
    },
    [session, travelM, heard, again, spendAct]
  );

  const typing = useCallback(
    (on: boolean) => {
      if (!session) return;
      const now = Date.now();
      if (on) {
        if (typingSentAt.current !== null && now - typingSentAt.current < TYPING_REFRESH_MS) return;
        typingSentAt.current = now;
      } else {
        if (typingSentAt.current === null) return;
        typingSentAt.current = null;
      }
      typingM({ on }).catch(() => undefined);
    },
    [session, typingM]
  );

  const duels = useHeldValue(useQuery(api.world.duels, session && !dormant ? { roomId: session.roomId } : "skip"), visitKey).value;
  const duelPickM = useMutation(api.world.duelPick).withOptimisticUpdate((store, { duelId, round, pick }) => {
    const me = meIn(store);
    const rows = me && store.getQuery(api.world.duels, { roomId: me.roomId });
    if (me && rows) {
      store.setQuery(api.world.duels, { roomId: me.roomId }, rows.map((row) => (row.id === duelId && row.round === round ? { ...row, myPick: pick } : row)));
    }
  });
  const pickInDuel = useCallback(
    async (duelId: Id<"worldDuels">, round: number, pick: string): Promise<string | null> => {
      try {
        const reply = await duelPickM({ duelId, round, pick });
        return reply.ok ? null : reply.reason;
      } catch (e) {
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [duelPickM]
  );

  const ball = useHeldValue(useQuery(api.world.ball, session?.place === BALL_PLACE && !dormant ? { roomId: session.roomId } : "skip"), visitKey).value;
  const kickM = useMutation(api.world.kickBall).withOptimisticUpdate(showKick);
  const kick = useCallback(
    (dirX: number, dirZ: number) => {
      if (holding.current) return;
      const sentAt = Date.now();
      stats.current.kick++;
      kickM({ dirX, dirZ })
        .then((reply) => heard(reply.serverNow, sentAt))
        .catch((e: unknown) => {
          if (leftGarden(e)) again();
        });
    },
    [kickM, heard, again]
  );

  const placeCounts = useHeldValue(useQuery(api.world.places, session && !dormant ? {} : "skip"), visitKey).value;
  const inviteM = useMutation(api.world.invite);
  const invite = useCallback(
    async (memberId: MemberId): Promise<string | null> => {
      try {
        const reply = await inviteM({ memberId });
        if (reply.ok) return null;
        return turnedAwayText(reply);
      } catch (e) {
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [inviteM, again]
  );

  /** Saves a look from the editor: one write, only when Save is pressed. */
  const saveLook = useCallback(
    async (look: Look): Promise<string | null> => {
      stats.current.saveLook++;
      try {
        const reply = await saveLookM({ look });
        return reply.ok ? null : "Saved a moment ago. Try again in a few seconds.";
      } catch (e) {
        return e instanceof ConvexError ? String(e.data) : "That didn't save.";
      }
    },
    [saveLookM]
  );

  const publishPing = useCallback(
    (bars: PingBars) => {
      const { bars: published, at: publishedAt } = publishedPing.current;
      if (publishing.current || !shouldPublishPing({ bars, published, publishedAt, now: Date.now() })) return;
      publishing.current = true;
      stats.current.ping++;
      publishedPing.current = { bars: published, at: Date.now() };
      pingM({ bars })
        .then((reply) => {
          if (reply.published) publishedPing.current = { bars, at: publishedPing.current.at };
        })
        .catch(() => undefined)
        .finally(() => {
          publishing.current = false;
        });
    },
    [pingM]
  );
  const probePing = useCallback(() => {
    if (probing.current || convex.watchQuery(api.auth.isAuthenticated, {}).localQueryResult() !== undefined) return;
    probing.current = true;
    stats.current.probe++;
    const sentAt = performance.now();
    const sentIn = pingVisit.current;
    probedAt.current = Date.now();
    convex
      .query(api.auth.isAuthenticated, {})
      .then(() => {
        if (sentIn === null || sentIn !== pingVisit.current) return;
        pingSamples.current = addPingSample(pingSamples.current, performance.now() - sentAt);
        const ms = pingEstimate(pingSamples.current);
        if (ms === null) return;
        setPingReading({ visit: sentIn.key, ms: Math.round(ms) });
        publishPing(pingBars(ms));
      })
      .catch(() => undefined)
      .finally(() => {
        probing.current = false;
      });
  }, [convex, publishPing]);
  useEffect(() => {
    if (!session) return;
    const visitNow = { key: pingVisitKey(session) };
    pingVisit.current = visitNow;
    pingSamples.current = [];
    probedAt.current = null;
    let id: ReturnType<typeof setTimeout>;
    const probe = () => {
      const active = AppState.currentState === "active";
      const due = () => ({ taken: pingSamples.current.length, lastAt: probedAt.current, now: Date.now() });
      if (active && pingProbeDue(due())) probePing();
      id = setTimeout(probe, active ? Math.max(PING_RECHECK_MS, pingProbeWait(due())) : PING_PROBE_MS);
    };
    probe();
    return () => {
      clearTimeout(id);
      if (pingVisit.current === visitNow) pingVisit.current = null;
      setPingReading(null);
    };
  }, [session, probePing]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    let id: ReturnType<typeof setTimeout> | null = null;
    const clear = () => {
      if (id !== null) {
        clearTimeout(id);
        id = null;
      }
    };
    const schedule = () => {
      clear();
      if (cancelled) return;
      const elapsed = Date.now() - lastAction.current;
      const wait = Math.max(0, HEARTBEAT_IDLE_MS - elapsed);
      id = setTimeout(() => {
        id = null;
        if (cancelled) return;
        const since = Date.now() - lastAction.current;
        if (since >= HEARTBEAT_IDLE_MS) checkIn();
        else schedule();
      }, wait);
    };
    const checkIn = () => {
      const sentAt = Date.now();
      lastAction.current = sentAt;
      stats.current.heartbeat++;
      heartbeatM({})
        .then((reply) => {
          if (cancelled) return;
          heard(reply.serverNow, sentAt);
          if (!reply.present) again();
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) schedule();
        });
    };
    schedule();
    const stop = subscribeForeground((active) => {
      if (active) checkIn();
    });
    return () => {
      cancelled = true;
      clear();
      stop();
    };
  }, [session, heartbeatM, heard, again]);

  const pingMs = shownPing(pingReading, session && pingVisitKey(session));
  const myBars = pingMs === null ? null : pingBars(pingMs);
  const people: WorldMember[] = useMemo(() => members.map((m) => {
    const row = states[m.memberId] as
      | (Walk & Pick<WorldMember, "say" | "act" | "ask" | "reply" | "answered" | "away" | "playing" | "reading" | "seat" | "typing">)
      | null
      | undefined
      | Error;
    const state = row && !(row instanceof Error) ? row : null;
    return {
      memberId: m.memberId,
      name: m.name,
      look: m.look,
      isMe: m.isMe,
      walk: m.isMe ? (myWalk ?? state) : state,
      gait: m.isMe ? myWalk?.gait : undefined,
      say: state?.say,
      act: state?.act,
      ask: state?.ask,
      reply: state?.reply,
      answered: state?.answered,
      away: state?.away,
      playing: state?.playing,
      reading: state?.reading,
      seat: m.isMe ? (mySeat ?? undefined) : state?.seat,
      typing: state?.typing,
      ping: m.isMe ? (myBars ?? undefined) : undefined,
    };
  }), [members, states, myWalk, mySeat, myBars]);

  // A once-a-second clock while anyone is walking or an ask to you is open,
  // so "can hear you", the High five button and ask countdowns stay current
  // outside the garden's own frame clock (the list view, the sheets). It
  // restarts when a walk or an ask changes and stops once nothing is moving.
  const latest = useRef(people);
  useEffect(() => {
    latest.current = people;
  });
  const liveKey = people.map((p) => `${p.walk?.startedAt ?? ""}:${p.ask?.at ?? ""}`).join(",");
  const myId = session?.memberId ?? null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!tickEverySecond) return;
    const live = () => {
      const now = serverNow();
      return latest.current.some(
        (p) =>
          (p.walk !== null && posAt(p.walk, now).walking) ||
          (p.ask !== undefined && p.ask.to === myId && now - p.ask.at < ASK_MS)
      );
    };
    if (!live()) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      if (!live()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [liveKey, myId, serverNow, tickEverySecond]);

  return {
    status: error ? ("error" as const) : roster ? ("in" as const) : ("joining" as const),
    error,
    instance: roster?.instance ?? session?.instance ?? 1,
    place: session?.place ?? ("garden" as Place),
    placeCounts,
    home: session?.place === "home" ? (home ?? null) : null,
    homeLoading: session?.place === "home" && home === undefined,
    invite,
    ping: pingMs,
    travel,
    roomId: session?.roomId ?? null,
    memberId: session?.memberId ?? null,
    people,
    serverWalk: myServerWalk,
    target,
    serverNow,
    walkTo,
    sitOn,
    holdStart,
    holdMove,
    holdEnd,
    say,
    typing,
    duels: duels ?? [],
    pickInDuel,
    ball: session?.place === BALL_PLACE ? (ball ?? null) : null,
    kick,
    act,
    ask,
    accept,
    saveLook,
  };
};
