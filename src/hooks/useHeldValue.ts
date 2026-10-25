import { useRef } from "react";

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
