import {
  ASK_MS,
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
  TYPING_REFRESH_MS,
  posAt,
  type Walk,
} from "@shared/world";
import { useMutation, useQueries, useQuery } from "convex/react";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "../../convex/_generated/api";
import { carryGait, restingGait, type Gait } from "./gait";
import type { Id } from "../../convex/_generated/dataModel";

type MemberId = Id<"worldMembers">;
type StateRow = NonNullable<FunctionReturnType<typeof api.world.state>>;
type Session = { roomId: Id<"worldRooms">; memberId: MemberId; instance: number; place: Place };

const placeFrom = (value: string): Place => (isPlace(value) ? value : "garden");

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
  seat?: string;
  typing?: number;
};

/** The id prefix of a chat line shown before the server has it. */
export const PENDING = "pending:";

/** Taps closer together than this send only the last one. */
const COALESCE_MS = 150;
const SAME_SPOT = 0.05;
const TOO_FAR_TO_BLEND = 3;

type LocalWalk = Walk & { gait: Gait };

const headFor = (walk: LocalWalk | null, to: { x: number; z: number }, now: number): LocalWalk => {
  const from = walk ? posAt(walk, now) : to;
  const next = { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: now };
  return { ...next, gait: carryGait(walk ? { walk, gait: walk.gait } : null, next, now) };
};

const blendIn = (walk: LocalWalk | null, server: Walk, now: number): LocalWalk => {
  const { fromX, fromZ, toX, toZ, startedAt } = server;
  const theirs = { fromX, fromZ, toX, toZ, startedAt };
  if (!walk) return { ...theirs, gait: restingGait(theirs) };
  if (Math.hypot(walk.toX - toX, walk.toZ - toZ) < SAME_SPOT) return walk;
  const here = posAt(walk, now);
  const there = posAt(theirs, now);
  if (Math.hypot(here.x - there.x, here.z - there.z) > TOO_FAR_TO_BLEND) {
    return { ...theirs, gait: carryGait({ walk, gait: walk.gait }, theirs, now) };
  }
  return headFor(walk, { x: toX, z: toZ }, now);
};

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

const showEmote = (store: OptimisticLocalStore, { emote }: { emote: string }) =>
  patchMine(store, (row) => ({ ...row, act: { emote, at: clock() } }));

const showLine = (store: OptimisticLocalStore, { text }: { text: string }) => {
  const me = meIn(store);
  const line = cleanLine(text);
  if (!me || !line) return;
  const at = clock();
  patchMine(store, (row) => ({ ...row, say: { text: line, at } }));
  const log = store.getQuery(api.world.chatLog, { roomId: me.roomId });
  if (log) {
    // Marked pending by its id until the server's line replaces it.
    const pending = { id: `${PENDING}${at}` as Id<"worldChat">, memberId: me.memberId, name: me.name, text: line, at, isMe: true, place: undefined, here: true, kind: undefined };
    store.setQuery(api.world.chatLog, { roomId: me.roomId }, [pending, ...log]);
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
export const useWorld = (enabled: boolean, away = false) => {
  const joinM = useMutation(api.world.join);
  const leaveM = useMutation(api.world.leave);
  const moveM = useMutation(api.world.move);
  const heartbeatM = useMutation(api.world.heartbeat);
  const awayM = useMutation(api.world.away);
  const travelM = useMutation(api.world.travel);
  const sitM = useMutation(api.world.sit);
  const typingM = useMutation(api.world.typing);
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
  const [error, setError] = useState<string | null>(null);
  const [rejoin, setRejoin] = useState(0);
  // Your own walk, ahead of the server so a tap moves you at once.
  const [myWalk, setMyWalk] = useState<LocalWalk | null>(null);
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
  const holdFrame = useRef<number | null>(null);
  // The finger's latest spot, for the send that ends a throttle window.
  const fingerAt = useRef<{ x: number; z: number } | null>(null);

  const serverNow = useCallback(() => Date.now() + (offset.current ?? 0), []);
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
    joinM({})
      .then((joined) => {
        if (cancelled) return;
        heard(joined.serverNow, sentAt);
        setSession({ roomId: joined.roomId, memberId: joined.memberId, instance: joined.instance, place: placeFrom(joined.place) });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ConvexError ? String(e.data) : "Couldn't open the garden.");
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
      if (holdFrame.current !== null) cancelAnimationFrame(holdFrame.current);
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
      awayM({ at: away ? "arcade" : null })
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
  }, [session, away, awayM]);

  const actTokens = useRef(fullBucket("act", 0));
  const spendAct = useCallback(() => {
    const taken = takeToken("act", actTokens.current, Date.now());
    if (taken.ok) actTokens.current = taken.bucket;
    return taken;
  }, []);

  const roster = useQuery(api.world.roster, session ? { roomId: session.roomId } : "skip");
  // Swept while away (a long background, a lost signal): come back in.
  useEffect(() => {
    if (session && roster === null && !travelling.current) again();
  }, [session, roster, again]);

  const members = roster?.members ?? [];

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
  const states = useQueries(requests);

  const myRow = session ? states[session.memberId] : undefined;
  const myServerWalk = myRow && !(myRow instanceof Error) ? (myRow as Walk) : null;
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
    inFlight.current = true;
    const sentAt = Date.now();
    const sentIn = visit.current;
    stats.current.move++;
    (to.seat ? sitM({ seat: to.seat }) : moveM({ toX: to.x, toZ: to.z }))
      .then((reply) => {
        if (sentIn !== visit.current) return;
        heard(reply.serverNow, sentAt);
        if (reply.ok) {
          const { fromX, fromZ, toX, toZ, startedAt } = reply;
          // While a finger is down the local walk leads; adopt the server's after release.
          if (!pending.current && !holding.current) {
            const now = serverNow();
            setMyWalk((walk) => blendIn(walk, { fromX, fromZ, toX, toZ, startedAt }, now));
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
  }, [moveM, sitM, heard, again, later, serverNow]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const walkTo = useCallback(
    (x: number, z: number) => {
      if (!session) return;
      const to = clampTarget(x, z, session.place);
      const now = serverNow();
      setMyWalk((walk) => headFor(walk, to, now));
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
      if (!seat) return;
      const now = serverNow();
      setMyWalk((walk) => headFor(walk, seat, now));
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
    (to: { x: number; z: number }) => {
      const now = serverNow();
      setMyWalk((walk) => headFor(walk, to, now));
      setTarget(to);
      fingerAt.current = to;
    },
    [serverNow]
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
      retarget(clampTarget(x, z, session.place));
    },
    [session, retarget]
  );

  const holdMove = useCallback(
    (x: number, z: number) => {
      if (!session || !holding.current) return;
      fingerAt.current = clampTarget(x, z, session.place);
      if (holdFrame.current !== null) return;
      holdFrame.current = requestAnimationFrame(() => {
        holdFrame.current = null;
        if (holding.current && fingerAt.current) retarget(fingerAt.current);
      });
    },
    [session, retarget]
  );

  const holdEnd = useCallback(
    (x: number, z: number) => {
      if (!session || !holding.current) return;
      holding.current = false;
      if (holdFrame.current !== null) cancelAnimationFrame(holdFrame.current);
      holdFrame.current = null;
      const to = clampTarget(x, z, session.place);
      retarget(to);
      sendNow(to);
    },
    [session, retarget, sendNow]
  );

  const say = useCallback(
    async (text: string): Promise<string | null> => {
      const sentAt = Date.now();
      stats.current.say++;
      try {
        const reply = await sayM({ text });
        heard(reply.serverNow, sentAt);
        return reply.ok ? null : `Slow down a little. Try again in ${Math.ceil(reply.retryInMs / 1000)}s.`;
      } catch (e) {
        if (leftGarden(e)) again();
        return e instanceof ConvexError ? String(e.data) : "That didn't send.";
      }
    },
    [sayM, heard, again]
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
    async (to: Place): Promise<string | null> => {
      if (!session || travelling.current) return null;
      travelling.current = true;
      pending.current = null;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const sentAt = Date.now();
      const sentIn = visit.current;
      try {
        const reply = await travelM({ to });
        if (sentIn !== visit.current) return null;
        heard(reply.serverNow, sentAt);
        if (!reply.ok) return turnedAwayText(reply);
        spendAct();
        pending.current = null;
        predicting.current = false;
        holding.current = false;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        const { fromX, fromZ, toX, toZ, startedAt } = reply;
        const arrived = { fromX, fromZ, toX, toZ, startedAt };
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

  const typingSentAt = useRef<number | null>(null);
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

  const duels = useQuery(api.world.duels, session ? { roomId: session.roomId } : "skip");
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

  const placeCounts = useQuery(api.world.places, session ? {} : "skip");

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

  // "Still here", only after a quiet spell. No query reads it, so it pushes nothing.
  useEffect(() => {
    if (!session) return;
    const checkIn = () => {
      const sentAt = Date.now();
      lastAction.current = sentAt;
      stats.current.heartbeat++;
      heartbeatM({})
        .then((reply) => {
          heard(reply.serverNow, sentAt);
          if (!reply.present) again();
        })
        .catch(() => undefined);
    };
    const id = setInterval(() => {
      if (Date.now() - lastAction.current >= HEARTBEAT_IDLE_MS) checkIn();
    }, 5000);
    const resumed = AppState.addEventListener("change", (state) => {
      if (state === "active") checkIn();
    });
    return () => {
      clearInterval(id);
      resumed.remove();
    };
  }, [session, heartbeatM, heard, again]);

  const people: WorldMember[] = members.map((m) => {
    const row = states[m.memberId] as
      | (Walk & Pick<WorldMember, "say" | "act" | "ask" | "reply" | "answered" | "away" | "seat" | "typing">)
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
      seat: m.isMe ? (mySeat ?? undefined) : state?.seat,
      typing: state?.typing,
    };
  });

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
  }, [liveKey, myId, serverNow]);

  return {
    status: error ? ("error" as const) : roster ? ("in" as const) : ("joining" as const),
    error,
    instance: roster?.instance ?? session?.instance ?? 1,
    place: session?.place ?? ("garden" as Place),
    placeCounts,
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
    act,
    ask,
    accept,
    saveLook,
  };
};
