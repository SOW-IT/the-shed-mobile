import { useHeldValue } from "@/hooks/useHeldValue";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { joinPages, splitAfter } from "./chatPages";
import { useDormant } from "./dormant";

type Lines = NonNullable<FunctionReturnType<typeof api.world.chatLog>>;

export const useChatLog = (roomId: Id<"worldRooms"> | null, limit: number): Lines | undefined => {
  const dormant = useDormant();
  const [split, setSplit] = useState<{ roomId: Id<"worldRooms">; at: number } | null>(null);
  const at = roomId && split?.roomId === roomId ? split.at : 0;
  const live = roomId && !dormant ? roomId : null;
  const tail = useQuery(api.world.chatLog, live ? { roomId: live, limit, after: at } : "skip");
  const head = useQuery(api.world.chatLog, live && at > 0 ? { roomId: live, limit, before: at } : "skip");
  const next = tail ? splitAfter(tail) : null;
  if (roomId && next !== null) setSplit({ roomId, at: next });
  const lines = useMemo(() => {
    if (tail === undefined || (at > 0 && head === undefined)) return undefined;
    return joinPages(tail ?? [], head ?? [], limit);
  }, [tail, head, at, limit]);
  return useHeldValue(lines, roomId ?? "").value;
};
