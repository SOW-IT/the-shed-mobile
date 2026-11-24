import { useOffline } from "@/hooks/useOffline";
import { markDevotionalSynced, useDirtyDevotionals } from "@/lib/devotionalStorage";
import { todayDevotionalDate, validateDevotionalDate, validateDevotionalInput } from "@shared/devotionals";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";

const RETRY_MS = 30_000;

export const DevotionalSync = () => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const me = useQuery(api.directory.me, isAuthenticated ? {} : "skip");
  const email = me?.email ?? null;
  const dirty = useDirtyDevotionals(email);
  const save = useMutation(api.devotionals.save);
  const syncing = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || offline || !email || dirty.length === 0 || syncing.current) return;
    const today = todayDevotionalDate();
    const candidate = dirty.find(
      (draft) =>
        validateDevotionalDate(draft.date, today).ok &&
        validateDevotionalInput({
          passage: draft.passage,
          notes: draft.notes,
          prayerPoints: draft.prayerPoints,
        }).ok
    );
    if (!candidate) return;
    syncing.current = true;
    save({
      date: candidate.date,
      passage: candidate.passage,
      notes: candidate.notes,
      prayerPoints: candidate.prayerPoints,
    })
      .then((result) =>
        markDevotionalSynced(email, candidate.date, result.passage, candidate.updatedAt, result.updatedAt)
      )
      .then(
        () => {
          syncing.current = false;
          setRetry((n) => n + 1);
        },
        (error: unknown) => {
          syncing.current = false;
          if (!(error instanceof ConvexError)) {
            retryTimer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
          }
        }
      );
  }, [isAuthenticated, offline, email, dirty, save, retry]);

  useEffect(
    () => () => {
      if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
    },
    []
  );

  return null;
};
