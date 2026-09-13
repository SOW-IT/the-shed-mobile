import { eventStaffYear, requestDisplayStatus } from "../../shared/flow";
import { roundToCents } from "../../shared/money";
import { Doc } from "../../convex/_generated/dataModel";
import { buildCsv } from "./csv";

/** Dollars with two decimals, so float drift never lands in a spreadsheet. */
const money = (amount: number): string => roundToCents(amount).toFixed(2);

const COLUMNS: { header: string; value: (r: Doc<"requests">) => string }[] = [
  { header: "Staff Year", value: (r) => String(eventStaffYear(r._creationTime)) },
  { header: "Created", value: (r) => isoDate(r._creationTime) },
  { header: "Requester Email", value: (r) => r.requesterEmail },
  { header: "Department", value: (r) => r.department },
  { header: "Description", value: (r) => r.description },
  { header: "Amount", value: (r) => money(r.amount) },
  { header: "Status", value: (r) => requestDisplayStatus(r) },
  { header: "HOD Approval", value: (r) => r.approvedByHOD },
  { header: "Budget Manager Approval", value: (r) => r.approvedByBudgetManager },
  { header: "Director Approval", value: (r) => r.approvedByDirector ?? "" },
  { header: "Finance Head Approval", value: (r) => r.approvedByFinanceHead },
  { header: "Decline Reason", value: (r) => r.declineReason ?? "" },
  {
    header: "Receipt Total",
    value: (r) => (r.receipt ? money(r.receipt.totalAmount) : ""),
  },
  { header: "Paid", value: (r) => (r.paid === true ? "Yes" : "No") },
  {
    header: "Paid Amount",
    value: (r) => (r.paidAmount != null ? money(r.paidAmount) : ""),
  },
  { header: "Paid At", value: (r) => (r.paidTime ? isoDate(r.paidTime) : "") },
  { header: "Pay Comment", value: (r) => r.payComment ?? "" },
];

const isoDate = (ms: number): string => new Date(ms).toISOString();

export const buildRequestsCsv = (rows: Doc<"requests">[]): string =>
  buildCsv(
    COLUMNS.map((c) => c.header),
    rows.map((row) => COLUMNS.map((c) => c.value(row)))
  );
