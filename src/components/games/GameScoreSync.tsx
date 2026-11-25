import { useOffline } from "@/hooks/useOffline";
import { notePaid, queueRuns, settleRuns, useBestRuns, useScoreQueue, useServerBests } from "@/lib/games/gameStorage";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { bestsToSync, MAX_SCORES_PER_SUBMIT, runsOf } from "../../../shared/games";
import { api } from "../../../convex/_generated/api";

const RETRY_MS = 60_000;

/**
 * Publishes game scores saved on this phone once it's online and someone is
 * signed in. Each run keeps its id across retries and the server keeps only
 * a person's best, so a resend after a dropped reply adds nothing.
 */
export const GameScoreSync = () => {
  const { isAuthenticated } = useConvexAuth();
  const offline = useOffline();
  const queue = useScoreQueue();
  const submit = useMutation(api.gameScores.submitScores);
  const sending = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [retry, setRetry] = useState(0);
  const runs = useBestRuns();
  const account = useServerBests();
  const tried = useRef(new Set<string>());

  useEffect(() => {
    if (!account) return;
    const missing = bestsToSync(runsOf(runs, account.email), account.bests, queue, Date.now(), tried.current);
    if (missing.length === 0) return;
    for (const run of missing) tried.current.add(run.runId);
    void queueRuns(missing);
  }, [runs, account, queue]);

  useEffect(() => {
    if (!isAuthenticated || offline || queue.length === 0 || sending.current) return;
    sending.current = true;
    submit({ scores: queue.slice(0, MAX_SCORES_PER_SUBMIT) })
      .then(({ accepted, rejected, coins }) => {
        notePaid(coins ?? []);
        return settleRuns([...accepted, ...rejected.map((r) => r.runId)]);
      })
      .then(
        () => {
          sending.current = false;
          // The queue may have changed while this was in flight; look again.
          setRetry((n) => n + 1);
        },
        () => {
          sending.current = false;
          retryTimer.current = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
        }
      );
  }, [isAuthenticated, offline, queue, submit, retry]);

  useEffect(
    () => () => {
      if (retryTimer.current !== undefined) clearTimeout(retryTimer.current);
    },
    []
  );

  return null;
};
