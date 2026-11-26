import type { Place, Walk } from "@shared/world";

/**
 * Whether a swept-session recovery join should start. Deduplicates overlapping
 * triggers (heartbeat, null roster, leftGarden error) and ignores stale replies
 * from an earlier member id after a recovery has already completed.
 */
export const canRecover = ({
  enabled,
  joining,
  currentMemberId,
  forMemberId,
}: {
  enabled: boolean;
  joining: boolean;
  currentMemberId: string | null;
  forMemberId?: string;
}): boolean => {
  if (!enabled || joining) return false;
  if (forMemberId !== undefined && currentMemberId !== null && currentMemberId !== forMemberId) return false;
  return true;
};

/**
 * Whether to keep the user's predicted walk, target and queued tap across a
 * recovery rejoin. Kept in the same place (the common swept-resume case), reset
 * if the server placed the user back in a different place (e.g. swept from
 * someone else's home back to the Garden).
 */
export const keepWalkOnRejoin = (prevPlace: Place | null, nextPlace: Place): boolean =>
  prevPlace !== null && prevPlace === nextPlace;

/**
 * Whether the client should adopt the server's walk over its local prediction.
 * Never overwrites a tap that is waiting on a rejoin or an in-flight move;
 * while predicting, only a walk well after ours (another device) takes over.
 */
export const shouldAdoptServerWalk = ({
  serverWalk,
  localWalk,
  predicting,
  joining,
  hasPending,
  inFlight,
}: {
  serverWalk: Walk | null;
  localWalk: Walk | null;
  predicting: boolean;
  joining: boolean;
  hasPending: boolean;
  inFlight: boolean;
}): boolean => {
  if (!serverWalk) return false;
  if (joining || hasPending || inFlight) return false;
  if (!localWalk) return true;
  const gap = predicting ? 1000 : 0;
  return serverWalk.startedAt > localWalk.startedAt + gap;
};
