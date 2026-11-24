import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_STEP_ACTOR_REQUESTS } from "../../shared/flow";

type StepActors = NonNullable<FunctionReturnType<typeof api.requests.stepActors>>;
type StepActorsById = Partial<Record<string, StepActors>>;

/**
 * A card's step actors from its list's query: undefined while that query
 * loads, null when the caller can't see the request.
 */
export type ListStepActors = { actors: StepActors | null | undefined };

const LOADING: ListStepActors = { actors: undefined };
const NOT_SHOWN: ListStepActors = { actors: null };

/**
 * Each card's entry, from the ids the list asked for and the latest answer.
 * While a new answer loads (`loading`), a card the latest answer already
 * has keeps it, so only cards new to the list read as loading. Each card
 * gets the same object for as long as the answer is the same, so a card
 * whose actors didn't change can skip rendering.
 */
export const stepActorsLookup = (
  asked: readonly string[],
  latest: StepActorsById | undefined,
  loading: boolean
): ((id: string) => ListStepActors | undefined) => {
  const covered = new Set(asked);
  const entries = new Map<string, ListStepActors>();
  for (const [id, actors] of Object.entries(latest ?? {})) {
    if (actors) entries.set(id, { actors });
  }
  return (id) => {
    if (!covered.has(id)) return undefined;
    return entries.get(id) ?? (loading ? LOADING : NOT_SHOWN);
  };
};

/**
 * The step actors of a list's cards, in one query instead of one per card.
 * Returns a lookup per card; a card it doesn't cover (past the first
 * MAX_STEP_ACTOR_REQUESTS) gets undefined and asks for its own.
 */
export const useRequestStepActors = (
  ids: Id<"requests">[] | undefined
): ((id: Id<"requests">) => ListStepActors | undefined) => {
  const asked = ids?.slice(0, MAX_STEP_ACTOR_REQUESTS) ?? [];
  const askedKey = asked.join(",");
  const result = useQuery(
    api.requests.stepActorsForRequests,
    asked.length > 0 ? { requestIds: asked } : "skip"
  );
  // useQuery answers undefined from the moment its ids change (Load more, a
  // request moving between sections) until the new answer arrives. Keep the
  // last answer meanwhile, so the cards already on screen keep their names.
  const [held, setHeld] = useState(result);
  if (result !== undefined && result !== held) setHeld(result);
  const latest = result ?? held;
  const loading = result === undefined;
  return useMemo(
    () => stepActorsLookup(askedKey === "" ? [] : askedKey.split(","), latest, loading),
    [askedKey, latest, loading]
  );
};
