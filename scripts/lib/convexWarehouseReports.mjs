const q = (project, dataset, table) => `\`${project}.${dataset}.${table}\``;

const snapshotDims = (alias) => [
  `${alias}._id AS snapshotId`,
  `${alias}._loadedAt AS loadedAt`,
  `JSON_VALUE(${alias}.document, '$.subgroup') AS subgroup`,
  `SAFE_CAST(JSON_VALUE(${alias}.document, '$.rangeWeeks') AS INT64) AS rangeWeeks`,
  `SAFE_CAST(JSON_VALUE(${alias}.document, '$.includeCollaborative') AS BOOL) AS includeCollaborative`,
  `SAFE_CAST(JSON_VALUE(${alias}.document, '$.staffYear') AS INT64) AS staffYear`,
];

const num = (path) => `SAFE_CAST(JSON_VALUE(s.document, '${path}') AS FLOAT64)`;
const int = (path) => `SAFE_CAST(JSON_VALUE(s.document, '${path}') AS INT64)`;
const bool = (path) => `SAFE_CAST(JSON_VALUE(s.document, '${path}') AS BOOL)`;
const ts = (expr) => `TIMESTAMP_MILLIS(SAFE_CAST(${expr} AS INT64))`;

const createView = (project, warehouse, name, body) =>
  [`CREATE OR REPLACE VIEW ${q(project, warehouse, name)} AS`, body.trim()].join("\n");

const trendView = (path) => (project, source, warehouse, name) =>
  createView(
    project,
    warehouse,
    name,
    `
SELECT
  ${snapshotDims("s").join(",\n  ")},
  ${ts("JSON_VALUE(point, '$.at')")} AS \`at\`,
  JSON_VALUE(point, '$.label') AS \`label\`,
  SAFE_CAST(JSON_VALUE(point, '$.value') AS FLOAT64) AS \`value\`
FROM ${q(project, source, "attendanceMetricsSnapshots")} AS s
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(s.document, '${path}'), [])) AS point
`.trim()
  );

const compositionView = (path, left, right) => (project, source, warehouse, name) =>
  createView(
    project,
    warehouse,
    name,
    `
SELECT
  ${snapshotDims("s").join(",\n  ")},
  ${ts("JSON_VALUE(point, '$.at')")} AS \`at\`,
  JSON_VALUE(point, '$.label') AS \`label\`,
  SAFE_CAST(JSON_VALUE(point, '$.${left}') AS FLOAT64) AS \`${left}\`,
  SAFE_CAST(JSON_VALUE(point, '$.${right}') AS FLOAT64) AS \`${right}\`
FROM ${q(project, source, "attendanceMetricsSnapshots")} AS s
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(s.document, '${path}'), [])) AS point
`.trim()
  );

const insightsSummarySql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "insights_summary",
    `
SELECT
  ${snapshotDims("s").join(",\n  ")},
  ${ts("JSON_VALUE(s.document, '$.computedAt')")} AS computedAt,
  ${num("$.data.summary.avgAttendance")} AS avgAttendance,
  ${num("$.data.summary.avgAttendancePrev")} AS avgAttendancePrev,
  ${num("$.data.summary.changePct")} AS changePct,
  ${num("$.data.summary.avgWeeklyAttendance")} AS avgWeeklyAttendance,
  ${num("$.data.summary.avgWeeklyAttendancePrev")} AS avgWeeklyAttendancePrev,
  ${num("$.data.summary.weeklyChangePct")} AS weeklyChangePct,
  ${int("$.data.summary.eventsHeld")} AS eventsHeld,
  ${int("$.data.summary.uniqueAttendees")} AS uniqueAttendees,
  ${int("$.data.summary.newcomers")} AS newcomers,
  ${int("$.data.summary.followUpCount")} AS followUpCount,
  ${num("$.data.summary.weeklyConsistency")} AS weeklyConsistency,
  ${num("$.data.summary.leaderShare")} AS leaderShare,
  ${num("$.data.summary.homeCampusShare")} AS homeCampusShare,
  ${bool("$.data.hasEnoughHistory")} AS hasEnoughHistory,
  ${bool("$.data.hasWeeklyMeetings")} AS hasWeeklyMeetings
FROM ${q(project, source, "attendanceMetricsSnapshots")} AS s
`.trim()
  );

const insightsFollowUpsSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "insights_follow_ups",
    `
SELECT
  ${snapshotDims("s").join(",\n  ")},
  JSON_VALUE(item, '$.key') AS personKey,
  JSON_VALUE(item, '$.name') AS name,
  JSON_VALUE(item, '$.kind') AS kind,
  JSON_VALUE(item, '$.subtitle') AS subtitle,
  ${ts("JSON_VALUE(item, '$.lastAttended')")} AS lastAttended,
  SAFE_CAST(JSON_VALUE(item, '$.recentCount') AS INT64) AS recentCount,
  JSON_VALUE(item, '$.reasonCode') AS reasonCode,
  JSON_VALUE(item, '$.reason') AS reason
FROM ${q(project, source, "attendanceMetricsSnapshots")} AS s
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(s.document, '$.data.followUps'), [])) AS item
`.trim()
  );

const insightsBreakdownsSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "insights_breakdowns",
    `
SELECT
  ${snapshotDims("s").join(",\n  ")},
  JSON_VALUE(breakdown, '$.field') AS field,
  JSON_VALUE(row, '$.label') AS label,
  SAFE_CAST(JSON_VALUE(row, '$.value') AS FLOAT64) AS value
FROM ${q(project, source, "attendanceMetricsSnapshots")} AS s
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(s.document, '$.data.breakdowns'), [])) AS breakdown
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(breakdown, '$.rows'), [])) AS row
`.trim()
  );

const staffAssignmentsSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "staff_assignments",
    `
SELECT
  s._id AS staffId,
  s._loadedAt AS loadedAt,
  JSON_VALUE(s.document, '$.email') AS email,
  JSON_VALUE(s.document, '$.name') AS name,
  SAFE_CAST(JSON_VALUE(s.document, '$.year') AS INT64) AS year,
  JSON_VALUE(s.document, '$.importId') AS importId,
  JSON_VALUE(assignment, '$.role') AS role,
  JSON_VALUE(assignment, '$.department') AS department,
  JSON_VALUE(assignment, '$.division') AS division,
  JSON_VALUE(assignment, '$.university') AS university
FROM ${q(project, source, "staffProfiles")} AS s
LEFT JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(s.document, '$.assignments'), [])) AS assignment
`.trim()
  );

const attendanceSigninsSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "attendance_signins",
    `
SELECT
  a._id AS attendanceId,
  a._loadedAt AS loadedAt,
  JSON_VALUE(a.document, '$.email') AS email,
  JSON_VALUE(a.document, '$.memberId') AS memberId,
  JSON_VALUE(m.document, '$.name') AS memberName,
  ${ts("JSON_VALUE(a.document, '$.signInTime')")} AS signInTime,
  JSON_VALUE(a.document, '$.notes') AS notes,
  JSON_VALUE(a.document, '$.eventId') AS eventId,
  JSON_VALUE(e.document, '$.name') AS eventName,
  ${ts("JSON_VALUE(e.document, '$.dateStart')")} AS eventStart,
  ${ts("JSON_VALUE(e.document, '$.dateEnd')")} AS eventEnd
FROM ${q(project, source, "attendance")} AS a
LEFT JOIN ${q(project, source, "events")} AS e
  ON e._id = JSON_VALUE(a.document, '$.eventId')
LEFT JOIN ${q(project, source, "attendanceMembers")} AS m
  ON m._id = JSON_VALUE(a.document, '$.memberId')
`.trim()
  );

const eventSubgroupsSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "event_subgroups",
    `
SELECT
  e._id AS eventId,
  e._loadedAt AS loadedAt,
  JSON_VALUE(e.document, '$.name') AS eventName,
  ${ts("JSON_VALUE(e.document, '$.dateStart')")} AS eventStart,
  JSON_VALUE(subgroup, '$') AS subgroup
FROM ${q(project, source, "events")} AS e
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(e.document, '$.subgroups'), [])) AS subgroup
`.trim()
  );

const requestsStatusSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "requests_status",
    `
SELECT
  r._id AS requestId,
  r._creationTime AS createdAt,
  r._loadedAt AS loadedAt,
  JSON_VALUE(r.document, '$.requesterEmail') AS requesterEmail,
  JSON_VALUE(r.document, '$.department') AS department,
  JSON_VALUE(r.document, '$.description') AS description,
  SAFE_CAST(JSON_VALUE(r.document, '$.amount') AS FLOAT64) AS amount,
  JSON_VALUE(r.document, '$.approvedByHOD') AS approvedByHOD,
  JSON_VALUE(r.document, '$.approvedByBudgetManager') AS approvedByBudgetManager,
  JSON_VALUE(r.document, '$.approvedByDirector') AS approvedByDirector,
  JSON_VALUE(r.document, '$.approvedByFinanceHead') AS approvedByFinanceHead,
  JSON_VALUE(r.document, '$.declineReason') AS declineReason,
  ${ts("JSON_VALUE(r.document, '$.approvedTime')")} AS approvedTime,
  ${ts("JSON_VALUE(r.document, '$.declinedTime')")} AS declinedTime,
  SAFE_CAST(JSON_VALUE(r.document, '$.paid') AS BOOL) AS paid,
  SAFE_CAST(JSON_VALUE(r.document, '$.paidAmount') AS FLOAT64) AS paidAmount,
  ${ts("JSON_VALUE(r.document, '$.paidTime')")} AS paidTime,
  JSON_VALUE(r.document, '$.payComment') AS payComment
FROM ${q(project, source, "requests")} AS r
`.trim()
  );

const requestRecipientsSql = (project, source, warehouse) =>
  createView(
    project,
    warehouse,
    "request_recipients",
    `
SELECT
  r._id AS requestId,
  r._loadedAt AS loadedAt,
  JSON_VALUE(r.document, '$.requesterEmail') AS requesterEmail,
  JSON_VALUE(r.document, '$.department') AS department,
  SAFE_CAST(JSON_VALUE(r.document, '$.amount') AS FLOAT64) AS requestAmount,
  SAFE_CAST(JSON_VALUE(r.document, '$.paid') AS BOOL) AS paid,
  JSON_VALUE(recipient, '$.accountName') AS accountName,
  JSON_VALUE(recipient, '$.bsb') AS bsb,
  JSON_VALUE(recipient, '$.accountNumber') AS accountNumber,
  SAFE_CAST(JSON_VALUE(recipient, '$.amount') AS FLOAT64) AS amount
FROM ${q(project, source, "requests")} AS r
CROSS JOIN UNNEST(IFNULL(JSON_QUERY_ARRAY(r.document, '$.receipt.recipients'), [])) AS recipient
`.trim()
  );

/** Flat, JSON-free views for Looker Studio and Connected Sheets. */
export const REPORT_VIEWS = [
  {
    name: "insights_summary",
    requires: ["attendanceMetricsSnapshots"],
    sql: insightsSummarySql,
  },
  {
    name: "insights_weekly_trend",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      trendView("$.data.weeklyTrend")(project, source, warehouse, "insights_weekly_trend"),
  },
  {
    name: "insights_attendance_by_event",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      trendView("$.data.attendanceByEvent")(
        project,
        source,
        warehouse,
        "insights_attendance_by_event"
      ),
  },
  {
    name: "insights_rolling_average",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      trendView("$.data.rollingAverage")(project, source, warehouse, "insights_rolling_average"),
  },
  {
    name: "insights_unique_by_month",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      trendView("$.data.uniqueByMonth")(project, source, warehouse, "insights_unique_by_month"),
  },
  {
    name: "insights_new_vs_returning",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      compositionView("$.data.newVsReturning", "fresh", "returning")(
        project,
        source,
        warehouse,
        "insights_new_vs_returning"
      ),
  },
  {
    name: "insights_leaders_vs_others",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      compositionView("$.data.leadersVsOthers", "primary", "rest")(
        project,
        source,
        warehouse,
        "insights_leaders_vs_others"
      ),
  },
  {
    name: "insights_campus_mix",
    requires: ["attendanceMetricsSnapshots"],
    sql: (project, source, warehouse) =>
      compositionView("$.data.campusMix", "primary", "rest")(
        project,
        source,
        warehouse,
        "insights_campus_mix"
      ),
  },
  {
    name: "insights_follow_ups",
    requires: ["attendanceMetricsSnapshots"],
    sql: insightsFollowUpsSql,
  },
  {
    name: "insights_breakdowns",
    requires: ["attendanceMetricsSnapshots"],
    sql: insightsBreakdownsSql,
  },
  {
    name: "staff_assignments",
    requires: ["staffProfiles"],
    sql: staffAssignmentsSql,
  },
  {
    name: "attendance_signins",
    requires: ["attendance", "events", "attendanceMembers"],
    sql: attendanceSigninsSql,
  },
  {
    name: "event_subgroups",
    requires: ["events"],
    sql: eventSubgroupsSql,
  },
  {
    name: "requests_status",
    requires: ["requests"],
    sql: requestsStatusSql,
  },
  {
    name: "request_recipients",
    requires: ["requests"],
    sql: requestRecipientsSql,
  },
];

export const reportViewsToPublish = (loadedTables) => {
  const have = new Set(loadedTables);
  return REPORT_VIEWS.filter((view) => view.requires.every((table) => have.has(table))).map(
    (view) => view.name
  );
};

export const reportViewSql = (project, sourceDataset, warehouseDataset, name) => {
  const view = REPORT_VIEWS.find((item) => item.name === name);
  if (!view) return null;
  return view.sql(project, sourceDataset, warehouseDataset);
};
