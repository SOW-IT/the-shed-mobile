import { CAFE_PLACE } from "@shared/cafeGames";
import type { Settings } from "@shared/mahjong/table";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type Reply = { ok: true } | { ok: false; reason: string };

const attempt = async (send: () => Promise<Reply | null>) => {
  try {
    const reply = await send();
    return reply && !reply.ok ? reply.reason : null;
  } catch (e) {
    return e instanceof ConvexError ? String(e.data) : "That didn't send.";
  }
};

/** The mahjong tables for the World: the caller's own, and every table in their Café room. */
export const useMahjong = ({ status, place, roomId }: { status: string; place: string; roomId: Id<"worldRooms"> | null }) => {
  const inWorld = status === "in";
  const inCafe = inWorld && place === CAFE_PLACE && roomId !== null;
  const mine = useQuery(api.mahjong.mine, inWorld ? {} : "skip");
  const tables = useQuery(api.mahjong.tables, inCafe && roomId ? { roomId } : "skip");
  const addBotM = useMutation(api.mahjong.addBot);
  const removeBotM = useMutation(api.mahjong.removeBot);
  const settingsM = useMutation(api.mahjong.setSettings);
  const leaveM = useMutation(api.mahjong.leave);
  const replaceM = useMutation(api.mahjong.replaceBot);
  const startM = useMutation(api.mahjong.start);
  return {
    inCafe,
    mine: mine ?? null,
    tables: tables ?? [],
    addBot: useCallback((seat: number) => attempt(() => addBotM({ seat })), [addBotM]),
    removeBot: useCallback((seat: number) => attempt(() => removeBotM({ seat })), [removeBotM]),
    setSettings: useCallback((settings: Settings) => attempt(() => settingsM({ settings })), [settingsM]),
    leave: useCallback(() => attempt(() => leaveM({})), [leaveM]),
    start: useCallback(() => attempt(() => startM({})), [startM]),
    replaceBot: useCallback((tableId: Id<"mahjongTables">, seat: number) => attempt(() => replaceM({ tableId, seat })), [replaceM]),
  };
};

export type Mahjong = ReturnType<typeof useMahjong>;
export type MahjongMine = NonNullable<Mahjong["mine"]>;
export type MahjongSeatView = MahjongMine["seats"][number];
