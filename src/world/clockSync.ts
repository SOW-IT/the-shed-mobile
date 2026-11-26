/** Replies slower than this were likely queued offline or across a background pause. */
export const MAX_CLOCK_RTT_MS = 2000;

/**
 * Updates the smoothed `serverNow - Date.now()` offset from one server reply.
 * Replies with a high or negative round-trip time are ignored so a mutation
 * queued while offline or backgrounded cannot pull the client clock ahead.
 */
export const nextClockOffset = (
  current: number | null,
  serverTime: number,
  sentAt: number,
  receivedAt: number
): number | null => {
  const rtt = receivedAt - sentAt;
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > MAX_CLOCK_RTT_MS) return current;
  const sample = serverTime - (sentAt + receivedAt) / 2;
  return current === null ? sample : current * 0.8 + sample * 0.2;
};
