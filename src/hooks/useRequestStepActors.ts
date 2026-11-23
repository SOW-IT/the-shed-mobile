import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_STEP_ACTOR_REQUESTS } from "../../shared/flow";

type StepActors = NonNullable<FunctionReturnType<typeof api.requests.stepActors>>;

/**
 * A card's step actors from its list's query: undefined while that query
 * loads, null when the caller can't see the request.
 */
export type ListStepActors = { actors: StepActors | null | undefined };

/**
 * The step actors of a list's cards, in one query instead of one per card.
 * Returns a lookup per card; a card it doesn't cover (past the first
 * MAX_STEP_ACTOR_REQUESTS) gets undefined and asks for its own.
 */
export const useRequestStepActors = (
  ids: Id<"requests">[] | undefined
): ((id: Id<"requests">) => ListStepActors | undefined) => {
  const asked = ids?.slice(0, MAX_STEP_ACTOR_REQUESTS) ?? [];
  const result = useQuery(
    api.requests.stepActorsForRequests,
    asked.length > 0 ? { requestIds: asked } : "skip"
  );
  const covered = new Set<string>(asked);
  return (id) =>
    covered.has(id) ? { actors: result === undefined ? undefined : (result[id] ?? null) } : undefined;
};
