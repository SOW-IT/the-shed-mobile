// Which way the world shows: the drawn garden, or a plain list of who's here
// and what they said. The list is the fallback for VoiceOver, for being
// offline, and for anyone who'd rather have it.

export type WorldView = "garden" | "list";

export const pickView = ({
  offline,
  screenReader,
  chosen,
  canDraw = true,
}: {
  offline: boolean;
  screenReader: boolean;
  /** What the person picked this visit, if anything. */
  chosen: WorldView | null;
  /**
   * Whether this platform draws the garden right. Android ignores the
   * perspective part of a view's matrix, so its quads come out wrong.
   */
  canDraw?: boolean;
}): WorldView => {
  if (offline || !canDraw) return "list";
  if (chosen) return chosen;
  return screenReader ? "list" : "garden";
};

/** "2 people can hear you", for the chip over the garden. */
export const hearingLabel = (n: number) =>
  n === 0 ? "Nobody can hear you yet" : `${n} ${n === 1 ? "person" : "people"} can hear you`;
