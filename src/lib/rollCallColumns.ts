// The two-column roll call gives each column its own scroll box, so the
// columns need a fixed height: the window below them, less the footer. With a
// short window, and an ended event's footer is the tallest this screen has,
// that height used to drop to nothing and the columns grew to fit every row,
// which left the lists unable to scroll. They now keep room for a section
// header and three rows, and the page scrolls to show them.
export const ROLL_CALL_COLUMNS_MIN_HEIGHT = 300;

export const rollCallColumnsHeight = (
  windowHeight: number,
  columnsTop: number,
  bottomGap: number
): number => Math.max(ROLL_CALL_COLUMNS_MIN_HEIGHT, Math.round(windowHeight - columnsTop - bottomGap));
