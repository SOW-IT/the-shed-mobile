import { useOffline } from "@/hooks/useOffline";
import { settleRuns, useScoreQueue } from "@/lib/games/gameStorage";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { MAX_SCORES_PER_SUBMIT } from "../../../shared/games";
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
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || offline || queue.length === 0 || sending.current) return;
    sending.current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    submit({ scores: queue.slice(0, MAX_SCORES_PER_SUBMIT) })
      .then(({ accepted, rejected }) => settleRuns([...accepted, ...rejected.map((r) => r.runId)]))
      .catch(() => {
        timer = setTimeout(() => setRetry((n) => n + 1), RETRY_MS);
      })
      .finally(() => {
        sending.current = false;
      });
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [isAuthenticated, offline, queue, submit, retry]);

  return null;
};
