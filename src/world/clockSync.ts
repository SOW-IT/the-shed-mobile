/** Replies slower than this were likely queued offline or across a background pause. */
export const MAX_CLOCK_RTT_MS = 2000;

/**
 * Updates the smoothed `serverNow - Date.now()` offset from one server reply.
 * Replies with a high or negative round-trip time are ignored so a mutation
 * queued while offline or backgrounded cannot pull the client clock ahead.
 */
export type ClockOffset = { offset: number; rtt: number };

const isSlow = (rtt: number) => rtt > MAX_CLOCK_RTT_MS;

export const nextClockOffset = (
  current: ClockOffset | null,
  serverTime: number,
  sentAt: number,
  receivedAt: number
): ClockOffset | null => {
  const rtt = receivedAt - sentAt;
  if (!Number.isFinite(rtt) || rtt < 0) return current;
  const sample = serverTime - (sentAt + receivedAt) / 2;
  if (!isSlow(rtt)) {
    if (current === null || isSlow(current.rtt)) return { offset: sample, rtt };
    return { offset: current.offset * 0.8 + sample * 0.2, rtt };
  }
  if (current === null || (isSlow(current.rtt) && rtt < current.rtt)) return { offset: sample, rtt };
  return current;
};
