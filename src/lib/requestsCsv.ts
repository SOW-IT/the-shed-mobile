import { Paths, File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { requestDisplayStatus } from "../../shared/flow";
import { Doc } from "../../convex/_generated/dataModel";

/** CSV columns, in order, with how to derive each cell from a request. */
const COLUMNS: { header: string; value: (r: Doc<"requests">) => string }[] = [
  { header: "Staff Year", value: (r) => String(r.year) },
  { header: "Created", value: (r) => isoDate(r._creationTime) },
  { header: "Requester Email", value: (r) => r.requesterEmail },
  { header: "Department", value: (r) => r.department },
  { header: "Description", value: (r) => r.description },
  { header: "Amount", value: (r) => String(r.amount) },
  { header: "Status", value: (r) => requestDisplayStatus(r) },
  { header: "HOD Approval", value: (r) => r.approvedByHOD },
  { header: "Budget Manager Approval", value: (r) => r.approvedByBudgetManager },
  { header: "Director Approval", value: (r) => r.approvedByDirector ?? "" },
  { header: "Finance Head Approval", value: (r) => r.approvedByFinanceHead },
  { header: "Decline Reason", value: (r) => r.declineReason ?? "" },
  {
    header: "Receipt Total",
    value: (r) => (r.receipt ? String(r.receipt.totalAmount) : ""),
  },
  { header: "Paid", value: (r) => (r.paid === true ? "Yes" : "No") },
  {
    header: "Paid Amount",
    value: (r) => (r.paidAmount != null ? String(r.paidAmount) : ""),
  },
  { header: "Paid At", value: (r) => (r.paidTime ? isoDate(r.paidTime) : "") },
  { header: "Pay Comment", value: (r) => r.payComment ?? "" },
];

const isoDate = (ms: number): string => new Date(ms).toISOString();

/**
 * Escapes a single CSV field: wraps it in quotes when it contains a comma,
 * quote or newline (doubling embedded quotes), and prefixes values that begin
 * with a formula trigger (`= + - @`) with a single quote to defang CSV/formula
 * injection when opened in a spreadsheet.
 */
const escapeField = (raw: string): string => {
  const guarded = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
};

/** Builds the full CSV text (header + one row per request) from request docs. */
export const buildRequestsCsv = (rows: Doc<"requests">[]): string => {
  const lines = [COLUMNS.map((c) => escapeField(c.header)).join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => escapeField(c.value(row))).join(","));
  }
  return lines.join("\r\n");
};

/**
 * Downloads (web) or shares (native) the CSV text under `filename`.
 * - Web: triggers a browser download via a temporary object-URL anchor.
 * - Native: writes to the cache directory and opens the system share sheet.
 */
export const downloadCsv = async (
  filename: string,
  csv: string
): Promise<void> => {
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle: "Export requests",
    });
  }
};
