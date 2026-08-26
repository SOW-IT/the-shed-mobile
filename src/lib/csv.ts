export const escapeField = (raw: string): string => {
  const guarded = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
};

export const csvLine = (cells: string[]): string =>
  cells.map(escapeField).join(",");

export const buildCsv = (header: string[], rows: string[][]): string =>
  [csvLine(header), ...rows.map(csvLine)].join("\r\n");
