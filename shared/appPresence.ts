export const APP_PING_MS = 60_000;

export const APP_WRITE_GAP_MS = 45_000;

export const IN_APP_MS = 150_000;

export const IN_APP_TICK_MS = 30_000;

export const IN_APP_SCAN = 500;

export const inAppTick = (now: number) => Math.floor(now / IN_APP_TICK_MS);

export const shouldWriteAppSeen = (appSeenAt: number | undefined, now: number) =>
  appSeenAt === undefined || now - appSeenAt >= APP_WRITE_GAP_MS;
