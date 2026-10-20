export const DATABASE_BANDWIDTH_COLUMN = 5;
export const DEPLOYMENT_COLUMN = 12;

const bytesOf = (raw) => {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
};

export const databaseBandwidthByDeployment = (rows) => {
  const totals = new Map();
  rows.forEach((row, index) => {
    const deployment = Array.isArray(row) ? row[DEPLOYMENT_COLUMN] : undefined;
    const bytes = Array.isArray(row) ? bytesOf(row[DATABASE_BANDWIDTH_COLUMN]) : Number.NaN;
    if (typeof deployment !== "string" || deployment.trim() === "" || !Number.isFinite(bytes) || bytes < 0) {
      throw new Error(
        `Usage row ${index} has no usable deployment or bandwidth (${JSON.stringify(row).slice(0, 200)}); the dashboard API may have changed.`
      );
    }
    const key = deployment.trim();
    totals.set(key, (totals.get(key) ?? 0) + bytes);
  });
  return totals;
};
