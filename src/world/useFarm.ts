import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const MINUTE = 60_000;

const said = (e: unknown, otherwise: string) => (e instanceof ConvexError ? String(e.data) : otherwise);

const attempt = async (run: () => Promise<{ ok: boolean; reason?: string }>, otherwise: string): Promise<string | null> => {
  try {
    const reply = await run();
    return reply.ok ? null : (reply.reason ?? otherwise);
  } catch (e) {
    return said(e, otherwise);
  }
};

export const useMinuteClock = (serverNow: () => number, on: boolean) => {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!on) return;
    const first = setTimeout(() => setNow(serverNow()), 0);
    const id = setInterval(() => setNow(serverNow()), MINUTE);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [on, serverNow]);
  return now;
};

export const useFarm = ({ roomId, inBackyard }: { roomId: Id<"worldRooms"> | null; inBackyard: boolean }) => {
  const here = useQuery(api.farm.farm, inBackyard && roomId ? { roomId } : "skip");
  const bag = useQuery(api.farm.bag, {});
  const waterM = useMutation(api.farm.water);
  const plantM = useMutation(api.farm.plant);
  const harvestM = useMutation(api.farm.harvest);
  const clearM = useMutation(api.farm.clear);
  const buyPlotM = useMutation(api.farm.buyPlot);
  const buySeedsM = useMutation(api.farm.buySeeds);
  const sellM = useMutation(api.farm.sell);
  const remindersM = useMutation(api.farm.setReminders).withOptimisticUpdate((store, { on }) => {
    const current = store.getQuery(api.farm.bag, {});
    if (current) store.setQuery(api.farm.bag, {}, { ...current, reminders: on });
  });

  const water = useCallback((plot: number) => attempt(() => waterM({ plot }), "That didn't water."), [waterM]);
  const plant = useCallback((plot: number, crop: string) => attempt(() => plantM({ plot, crop }), "That didn't plant."), [plantM]);
  const harvest = useCallback(async (plot: number) => {
    try {
      const reply = await harvestM({ plot });
      return reply.ok ? { crop: reply.crop, wilts: reply.wilts } : reply.reason;
    } catch (e) {
      return said(e, "That didn't harvest.");
    }
  }, [harvestM]);
  const clear = useCallback((plot: number) => attempt(() => clearM({ plot }), "That didn't clear."), [clearM]);
  const buyPlot = useCallback((plot: number) => attempt(async () => ({ ok: (await buyPlotM({ plot })).plots > 0 }), "That didn't go through."), [buyPlotM]);
  const buySeeds = useCallback((crop: string, count: number) => attempt(async () => ({ ok: (await buySeedsM({ crop, count })).seeds > 0 }), "That didn't go through."), [buySeedsM]);
  const sell = useCallback(async (stack?: string): Promise<{ coins: number } | string> => {
    try {
      const reply = await sellM(stack === undefined ? { goods: true } : { stack, goods: true });
      return { coins: reply.coins };
    } catch (e) {
      return said(e, "That didn't sell.");
    }
  }, [sellM]);
  const setReminders = useCallback((on: boolean) => attempt(async () => {
    await remindersM({ on });
    return { ok: true };
  }, "That didn't save."), [remindersM]);

  return { view: inBackyard ? here : undefined, bag, water, plant, harvest, clear, buyPlot, buySeeds, sell, setReminders };
};


export const useAnimals = ({ roomId, inBackyard }: { roomId: Id<"worldRooms"> | null; inBackyard: boolean }) => {
  const here = useQuery(api.animals.yard, inBackyard && roomId ? { roomId } : "skip");
  const feedM = useMutation(api.animals.feed);
  const collectM = useMutation(api.animals.collect);
  const buyBuildingM = useMutation(api.animals.buyBuilding);
  const buyAnimalM = useMutation(api.animals.buyAnimal);
  const renameM = useMutation(api.animals.rename);
  const settleM = useMutation(api.animals.settle);
  const buyFeedM = useMutation(api.animals.buyFeed);
  const buyNameTagM = useMutation(api.animals.buyNameTag);

  const feed = useCallback(async (animalId: string): Promise<number | string> => {
    try {
      const reply = await feedM({ animalId });
      return reply.ok ? reply.serverNow : reply.reason;
    } catch (e) {
      return said(e, "That didn't feed.");
    }
  }, [feedM]);
  const collect = useCallback(async (animalId: string) => {
    try {
      const reply = await collectM({ animalId });
      return reply.ok ? { good: reply.good, serverNow: reply.serverNow } : reply.reason;
    } catch (e) {
      return said(e, "That didn't work.");
    }
  }, [collectM]);
  const buyBuilding = useCallback((kind: string) => attempt(async () => ({ ok: (await buyBuildingM({ kind })).balance >= 0 }), "That didn't go through."), [buyBuildingM]);
  const buyAnimal = useCallback((kind: string, name: string) => attempt(async () => ({ ok: (await buyAnimalM({ kind, name })).balance >= 0 }), "That didn't go through."), [buyAnimalM]);
  const rename = useCallback((animalId: string, name: string) => attempt(async () => ({ ok: (await renameM({ animalId, name })).name.length > 0 }), "That didn't rename."), [renameM]);
  const settle = useCallback(async (): Promise<string[]> => {
    try {
      return await settleM({});
    } catch {
      return [];
    }
  }, [settleM]);
  const buyFeed = useCallback((feedId: string, count: number) => attempt(async () => ({ ok: (await buyFeedM({ feed: feedId, count })).feed > 0 }), "That didn't go through."), [buyFeedM]);
  const buyNameTag = useCallback(() => attempt(async () => ({ ok: (await buyNameTagM({})).nameTags > 0 }), "That didn't go through."), [buyNameTagM]);

  return { view: inBackyard ? here : undefined, feed, collect, buyBuilding, buyAnimal, rename, settle, buyFeed, buyNameTag };
};
