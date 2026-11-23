// Which way the world shows: the drawn garden, or a plain list of who's here
// and what they said. The list is the fallback for VoiceOver, for being
// offline, and for anyone who'd rather have it.

type WorldView = "garden" | "list";

export const pickView = ({
  offline,
  screenReader,
  canDraw = true,
}: {
  offline: boolean;
  screenReader: boolean;
  /**
   * Whether this platform draws the garden right. Android ignores the
   * perspective part of a view's matrix, so its quads come out wrong.
   */
  canDraw?: boolean;
}): WorldView => {
  if (offline || !canDraw) return "list";
  return screenReader ? "list" : "garden";
};

export const clock = (at: number) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
