import { useRef } from "react";

/**
 * The last loaded value of a query, kept while it reloads with new arguments
 * so a list or preview doesn't collapse to a spinner and jump back. `stale`
 * is true while the value shown is from the previous arguments. A different
 * `holdKey` drops the held value (e.g. when a different person is picked).
 */
export function useHeldValue<T>(
  value: T | undefined,
  holdKey: string
): { value: T | undefined; stale: boolean } {
  const held = useRef<{ key: string; value: T } | null>(null);
  /* eslint-disable react-hooks/refs -- remembers the last value across renders only */
  if (value !== undefined) held.current = { key: holdKey, value };
  const fallback = held.current?.key === holdKey ? held.current.value : undefined;
  return value !== undefined
    ? { value, stale: false }
    : { value: fallback, stale: fallback !== undefined };
  /* eslint-enable react-hooks/refs */
}
