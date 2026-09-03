import { reportViewsToPublish } from "./convexWarehouseReports.mjs";

export const DEFAULT_WAREHOUSE_DATASET = "convex_warehouse";

const s = (name) => ({ name, type: "STRING" });
const i = (name) => ({ name, type: "INT64" });
const n = (name) => ({ name, type: "FLOAT64" });
const b = (name) => ({ name, type: "BOOL" });
const t = (name) => ({ name, type: "TIMESTAMP" });
const j = (name) => ({ name, type: "JSON" });

/** Scalar and nested fields to expose as typed columns. Nested objects stay JSON. */
export const WAREHOUSE_TABLES = {
  users: [
    s("name"),
    s("image"),
    s("email"),
    t("emailVerificationTime"),
    s("phone"),
    t("phoneVerificationTime"),
    b("isAnonymous"),
    s("localChurch"),
    s("avatarId"),
  ],
  staffProfiles: [s("email"), i("year"), j("assignments"), s("name"), s("userId"), s("importId")],
  divisions: [i("year"), s("name"), s("headEmail")],
  departments: [i("year"), s("name"), s("division"), s("headEmail"), s("colour")],
  universities: [i("year"), s("name")],
  roles: [i("year"), s("name")],
  directoryUsers: [s("email"), s("name"), s("photoId"), s("photoEtag")],
  syncState: [s("key"), t("at"), s("detail")],
  yearSettings: [
    i("year"),
    s("budgetManagerEmail"),
    s("directorEmail"),
    n("directorApprovalThreshold"),
    i("rolloverCopiedFrom"),
    t("rolloverCompletedAt"),
  ],
  approverDelegations: [i("year"), s("fromEmail"), s("toEmail")],
  leavers: [i("year"), s("email")],
  savedBankAccounts: [
    s("email"),
    s("accountName"),
    s("bsb"),
    s("accountNumber"),
    t("lastUsedAt"),
    b("preferred"),
  ],
  requestComments: [s("requestId"), s("authorEmail"), s("body")],
  commentReactions: [s("commentId"), s("userEmail"), s("emoji")],
  commentReads: [s("requestId"), s("userEmail"), t("lastReadAt")],
  requestEvents: [s("requestId"), s("action"), s("step"), s("actorEmail"), s("detail")],
  requests: [
    s("requesterEmail"),
    s("department"),
    s("description"),
    n("amount"),
    s("approvedByHOD"),
    s("approvedByBudgetManager"),
    s("approvedByDirector"),
    s("approvedByFinanceHead"),
    s("declineReason"),
    t("approvedTime"),
    t("declinedTime"),
    t("lastReminderAt"),
    i("reminderCount"),
    j("receipt"),
    b("paid"),
    n("paidAmount"),
    s("payComment"),
    t("paidTime"),
  ],
  notifications: [s("userEmail"), s("title"), s("body"), s("url"), s("requestId"), b("read")],
  requestNudges: [s("requestId"), s("nudgerEmail"), t("sentAt")],
  events: [s("name"), t("dateStart"), t("dateEnd"), s("sourceImportId"), j("subgroups"), j("tagIds")],
  attendanceAuditLog: [
    s("actorEmail"),
    s("entityType"),
    s("action"),
    s("summary"),
    s("eventId"),
    s("memberId"),
    s("subjectEmail"),
    s("detail"),
  ],
  attendanceTags: [s("name"), s("colour"), j("subgroups")],
  attendanceMetadata: [
    s("key"),
    s("type"),
    i("order"),
    j("values"),
    s("subgroup"),
    j("lockedValues"),
  ],
  attendanceMembers: [s("name"), s("email"), s("sourceImportId"), j("metadata")],
  attendance: [s("eventId"), s("email"), s("memberId"), t("signInTime"), s("notes")],
  attendanceMetricsSnapshots: [
    s("subgroup"),
    i("rangeWeeks"),
    b("includeCollaborative"),
    i("staffYear"),
    t("computedAt"),
    j("data"),
  ],
};

export const warehouseTableNames = () => Object.keys(WAREHOUSE_TABLES).sort();

export const fieldExpression = (field) => {
  const path = field.path ?? `$.${field.name}`;
  const jsonValue = `JSON_VALUE(document, '${path}')`;
  switch (field.type) {
    case "STRING":
      return jsonValue;
    case "INT64":
      return `SAFE_CAST(${jsonValue} AS INT64)`;
    case "FLOAT64":
      return `SAFE_CAST(${jsonValue} AS FLOAT64)`;
    case "BOOL":
      return `SAFE_CAST(${jsonValue} AS BOOL)`;
    case "TIMESTAMP":
      return `TIMESTAMP_MILLIS(SAFE_CAST(${jsonValue} AS INT64))`;
    case "JSON":
      return `JSON_QUERY(document, '${path}')`;
    default:
      throw new Error(`Unknown warehouse field type: ${field.type}`);
  }
};

export const warehouseViewSql = (project, sourceDataset, warehouseDataset, table) => {
  const fields = WAREHOUSE_TABLES[table];
  if (!fields) return null;
  const select = [
    "_id",
    "_creationTime",
    "_loadedAt",
    ...fields.map((field) => `${fieldExpression(field)} AS \`${field.name}\``),
  ];
  return [
    `CREATE OR REPLACE VIEW \`${project}.${warehouseDataset}.${table}\` AS`,
    "SELECT",
    `  ${select.join(",\n  ")}`,
    `FROM \`${project}.${sourceDataset}.${table}\``,
  ].join("\n");
};

export const warehouseViewsToPublish = (loadedTables) =>
  loadedTables.filter((name) => WAREHOUSE_TABLES[name]).sort();

export const staleWarehouseViews = (existing, loadedTables) => {
  const keep = new Set([
    ...warehouseViewsToPublish(loadedTables),
    ...reportViewsToPublish(loadedTables),
  ]);
  return existing.filter((name) => !keep.has(name)).sort();
};
