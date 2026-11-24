import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { joinPages, splitAfter } from "./chatPages";

type Lines = NonNullable<FunctionReturnType<typeof api.world.chatLog>>;

export const useChatLog = (roomId: Id<"worldRooms"> | null, limit: number): Lines | undefined => {
  const [split, setSplit] = useState<{ roomId: Id<"worldRooms">; at: number } | null>(null);
  const [kept, setKept] = useState<{ roomId: Id<"worldRooms">; lines: Lines } | null>(null);
  const at = roomId && split?.roomId === roomId ? split.at : 0;
  const tail = useQuery(api.world.chatLog, roomId ? { roomId, limit, after: at } : "skip");
  const head = useQuery(api.world.chatLog, roomId && at > 0 ? { roomId, limit, before: at } : "skip");
  const next = tail ? splitAfter(tail) : null;
  if (roomId && next !== null) setSplit({ roomId, at: next });
  const lines = useMemo(() => {
    if (tail === undefined || (at > 0 && head === undefined)) return undefined;
    return joinPages(tail ?? [], head ?? [], limit);
  }, [tail, head, at, limit]);
  if (roomId && lines && kept?.lines !== lines) setKept({ roomId, lines });
  return lines ?? (kept && kept.roomId === roomId ? kept.lines : undefined);
};
