/**
 * Pure CSV text helpers — no React Native or Expo imports, so they're usable
 * from unit tests. The native download/share lives in ./csvDownload.
 */

/**
 * Escapes a single CSV field: wraps it in quotes when it contains a comma,
 * quote or newline (doubling embedded quotes), and prefixes values that begin
 * with a formula trigger (`= + - @`) with a single quote to defang CSV/formula
 * injection when opened in a spreadsheet.
 */
export const escapeField = (raw: string): string => {
  const guarded = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
};

/** Joins a row of cells into one CSV line (each cell is escaped). */
export const csvLine = (cells: string[]): string =>
  cells.map(escapeField).join(",");

/** Builds CSV text from a header row plus body rows (all cells escaped). */
export const buildCsv = (header: string[], rows: string[][]): string =>
  [csvLine(header), ...rows.map(csvLine)].join("\r\n");
