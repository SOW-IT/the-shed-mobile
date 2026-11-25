type Stoppable = { stopPropagation: () => void };

const stopHere = (event: Stoppable) => event.stopPropagation();

export const touchBoundary = {
  onTouchStart: stopHere,
  onTouchMove: stopHere,
  onTouchEnd: stopHere,
  onTouchCancel: stopHere,
};
