export type InteractivePropId = "arcade" | "noticeboard" | "notices" | "piano" | "lectern";
export type HighlightTarget = { kind: "prop"; id: InteractivePropId } | { kind: "seat"; id: string } | { kind: "plot"; plot: number } | { kind: "animal"; id: string };

type Trips = {
  prop: { kind: InteractivePropId } | null;
  seat: { seatId: string } | null;
  plot: { plot: number } | null;
  animal: { id: string } | null;
};

/** What to ring while you walk over to it. Only one trip runs at a time; none means nothing is lit. */
export const tripTarget = ({ prop, seat, plot, animal }: Trips): HighlightTarget | null =>
  prop ? { kind: "prop", id: prop.kind } : seat ? { kind: "seat", id: seat.seatId } : plot ? { kind: "plot", plot: plot.plot } : animal ? { kind: "animal", id: animal.id } : null;
