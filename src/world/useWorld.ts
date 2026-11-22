import {
  clampTarget,
  HEARTBEAT_IDLE_MS,
  posAt,
  type Look,
  type Walk,
} from "@shared/world";
import { useMutation, useQueries, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

type MemberId = Id<"worldMembers">;
type Session = { roomId: Id<"worldRooms">; memberId: MemberId; instance: number };

export type WorldMember = {
  memberId: MemberId;
  name: string;
  look: Look;
  isMe: boolean;
  walk: Walk | null;
  say?: { text: string; at: number };
  act?: { emote: string; at: number };
};

/** Taps closer together than this send only the last one. */
const COALESCE_MS = 150;

/**
 * Counts of what this phone sent, for measuring the write budget. Tests and
 * the verify run read it from `globalThis.__shedWorld`.
 */
type WorldStats = { join: number; move: number; moveRefused: number; act: number; say: number; heartbeat: number; leave: number; since: number };
const newStats = (): WorldStats => ({ join: 0, move: 0, moveRefused: 0, act: 0, say: 0, heartbeat: 0, leave: 0, since: Date.now() });

const leftGarden = (e: unknown) => e instanceof ConvexError && /left the garden/.test(String(e.data));

/**
 * Being in the garden: joins on open, leaves on close or when the app goes
 * to the background, and keeps every write to one per action. Positions are
 * never sent per frame; each phone walks people along their latest walk.
 */
export const useWorld = (enabled: boolean) => {
  const joinM = useMutation(api.world.join);
  const leaveM = useMutation(api.world.leave);
  const moveM = useMutation(api.world.move);
  const actM = useMutation(api.world.act);
  const sayM = useMutation(api.world.say);
  const heartbeatM = useMutation(api.world.heartbeat);

  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(() => AppState.currentState !== "background");
  const [rejoin, setRejoin] = useState(0);
  const stats = useRef<WorldStats>(newStats());
  // Server time minus this phone's, smoothed over replies.
  const offset = useRef<number | null>(null);
  const lastAction = useRef(0);

  const serverNow = useCallback(() => Date.now() + (offset.current ?? 0), []);
  const heard = useCallback((serverTime: number, sentAt: number) => {
    const received = Date.now();
    const sample = serverTime - (sentAt + received) / 2;
    offset.current = offset.current === null ? sample : offset.current * 0.8 + sample * 0.2;
    lastAction.current = received;
  }, []);

  useEffect(() => {
    (globalThis as { __shedWorld?: WorldStats }).__shedWorld = stats.current;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setActive(state !== "background"));
    return () => sub.remove();
  }, []);

  // Join while open and in the foreground; leave otherwise.
  useEffect(() => {
    if (!enabled || !active) return;
    let cancelled = false;
    const sentAt = Date.now();
    const counts = stats.current;
    counts.join++;
    lastAction.current = sentAt;
    joinM({})
      .then((joined) => {
        if (cancelled) return;
        heard(joined.serverNow, sentAt);
        setSession({ roomId: joined.roomId, memberId: joined.memberId, instance: joined.instance });
        setError(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof ConvexError ? String(e.data) : "Couldn't open the garden.");
      });
    return () => {
      cancelled = true;
      setSession(null);
      counts.leave++;
      leaveM({}).catch(() => undefined);
    };
  }, [enabled, active, rejoin, joinM, leaveM, heard]);

  const again = useCallback(() => setRejoin((n) => n + 1), []);

  const roster = useQuery(api.world.roster, session ? { roomId: session.roomId } : "skip");
  // Swept while away (a long background, a lost signal): come back in.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the server says we're gone; join again once
    if (session && roster === null) again();
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

  // Your own walk, ahead of the server so a tap moves you at once.
  const [myWalk, setMyWalk] = useState<Walk | null>(null);
  const [target, setTarget] = useState<{ x: number; z: number } | null>(null);
  const myRow = session ? states[session.memberId] : undefined;
  const myServerWalk = myRow && !(myRow instanceof Error) ? (myRow as Walk) : null;
  useEffect(() => {
    // Adopt the server's walk when it's newer than ours (another device, or the first load).
    if (myServerWalk && (!myWalk || myServerWalk.startedAt > myWalk.startedAt + 1000)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopting a newer walk from the server
      setMyWalk(myServerWalk);
    }
  }, [myServerWalk, myWalk]);

  const pending = useRef<{ x: number; z: number } | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => undefined);
  const later = useCallback((ms: number) => {
    timer.current = setTimeout(() => flushRef.current(), ms);
  }, []);
  const flush = useCallback(() => {
    timer.current = null;
    const to = pending.current;
    if (!to || inFlight.current) return;
    pending.current = null;
    inFlight.current = true;
    const sentAt = Date.now();
    stats.current.move++;
    moveM({ toX: to.x, toZ: to.z })
      .then((reply) => {
        heard(reply.serverNow, sentAt);
        if (reply.ok) {
          const { fromX, fromZ, toX, toZ, startedAt } = reply;
          if (!pending.current) setMyWalk({ fromX, fromZ, toX, toZ, startedAt });
        } else {
          // Turned away by the rate limit: send the latest spot once a token is back.
          stats.current.moveRefused++;
          pending.current ??= to;
          later(reply.retryInMs);
        }
      })
      .catch((e: unknown) => {
        if (leftGarden(e)) again();
      })
      .finally(() => {
        inFlight.current = false;
        if (pending.current && !timer.current) later(COALESCE_MS);
      });
  }, [moveM, heard, again, later]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const walkTo = useCallback(
    (x: number, z: number) => {
      if (!session) return;
      const to = clampTarget(x, z);
      const now = serverNow();
      setMyWalk((walk) => {
        const from = walk ? posAt(walk, now) : to;
        return { fromX: from.x, fromZ: from.z, toX: to.x, toZ: to.z, startedAt: now };
      });
      setTarget(to);
      pending.current = to;
      lastAction.current = Date.now();
      if (timer.current) clearTimeout(timer.current);
      later(COALESCE_MS);
    },
    [session, serverNow, later]
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
    async (emote: string) => {
      const sentAt = Date.now();
      stats.current.act++;
      try {
        const reply = await actM({ emote });
        heard(reply.serverNow, sentAt);
      } catch (e) {
        if (leftGarden(e)) again();
      }
    },
    [actM, heard, again]
  );

  // "Still here", only after a quiet spell. No query reads it, so it pushes nothing.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => {
      if (Date.now() - lastAction.current < HEARTBEAT_IDLE_MS) return;
      const sentAt = Date.now();
      lastAction.current = sentAt;
      stats.current.heartbeat++;
      heartbeatM({})
        .then((reply) => {
          heard(reply.serverNow, sentAt);
          if (!reply.present) again();
        })
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(id);
  }, [session, heartbeatM, heard, again]);

  const people: WorldMember[] = members.map((m) => {
    const row = states[m.memberId] as (Walk & Pick<WorldMember, "say" | "act">) | null | undefined | Error;
    const state = row && !(row instanceof Error) ? row : null;
    return {
      memberId: m.memberId,
      name: m.name,
      look: m.look,
      isMe: m.isMe,
      walk: m.isMe ? (myWalk ?? state) : state,
      say: state?.say,
      act: state?.act,
    };
  });

  return {
    status: error ? ("error" as const) : roster ? ("in" as const) : ("joining" as const),
    error,
    instance: roster?.instance ?? session?.instance ?? 1,
    roomId: session?.roomId ?? null,
    people,
    target,
    serverNow,
    walkTo,
    say,
    act,
  };
};
