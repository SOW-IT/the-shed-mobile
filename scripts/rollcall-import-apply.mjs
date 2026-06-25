import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPORT_PATH = path.resolve(
  "coverage-tmp",
  process.argv.find((arg) => arg.startsWith("--report="))?.split("=")[1] ??
    "rollcall-import-dry-run.json"
);
const year = Number(process.argv.find((arg) => arg.startsWith("--year="))?.split("=")[1] ?? 2026);
const prepareOnly = process.argv.includes("--prepare-only");
const sourceGroup = process.argv
  .find((arg) => arg.startsWith("--source-group="))
  ?.split("=")[1];
const email =
  process.env.ROLLCALL_IMPORT_EMAIL ??
  process.argv.find((arg) => arg.startsWith("--email="))?.split("=")[1] ??
  "daniel.kim@sow.org.au";

const command = process.execPath;
const convexMain = path.resolve("node_modules", "convex", "bin", "main.js");
const identity = `{email:'${email}',subject:'${email}',issuer:'rollcall-import'}`;

// Member rows live under their event's CALENDAR year (Sydney), while the events
// themselves are bucketed by staff year (see the dry-run). Keep in sync with
// convex/rollcallImport.ts calendarYearOf and shared/flow.ts staffYearForDate.
const calendarYearOf = (ms) =>
  new Date(ms + 10 * 60 * 60 * 1000).getUTCFullYear();

// Runs against the already-deployed dev functions (push once with
// `npx convex dev --once` before applying). Embedded events can be large, so we
// never pass a whole big event in one arg — attendance is chunked per event.
function runConvex(functionName, args) {
  const jsonArgs = JSON.stringify(args);
  const run = () =>
    execFileSync(
      command,
      [convexMain, "run", "--identity", identity, functionName, jsonArgs],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  let output;
  try {
    output = run();
  } catch (error) {
    // ENAMETOOLONG is handled by the caller (it splits the chunk); retry any
    // other failure once, since a long import occasionally hits a transient
    // deployment/network hiccup.
    if (error?.code === "ENAMETOOLONG") throw error;
    output = run();
  }
  const jsonStart = output.indexOf("{");
  if (jsonStart === -1) return output.trim();
  return JSON.parse(output.slice(jsonStart));
}

function chunks(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
if (report.year !== year) {
  throw new Error(`Report year ${report.year} does not match requested year ${year}`);
}

const metadataPayload = report.metadata.map(
  ({ key, type, order, values, subgroup, sourceIds }) => ({
    key,
    type,
    order,
    values,
    subgroup,
    sourceIds: [...new Set(sourceIds ?? [])],
  })
);

// Member fields (and the per-field id mapping) live under each calendar year the
// events touch — a staff year spans the previous calendar year's Oct–Dec events
// and this calendar year's Jan–Sep events, so prepare both and key the field
// maps by calendar year for importEvents.
const calendarYears = [
  ...new Set(report.events.map((event) => calendarYearOf(event.dateStart))),
].sort();
const fieldMapByYear = {};
for (const calendarYear of calendarYears) {
  const prepared = runConvex("rollcallImport:prepare", {
    year: calendarYear,
    metadata: metadataPayload,
    tags: [],
  });
  fieldMapByYear[String(calendarYear)] = prepared.fieldMap;
  console.log(`Prepared metadata for calendar year ${calendarYear}.`);
}

// Tags live under the staff year, since events (which reference them) do.
const preparedTags = runConvex("rollcallImport:prepare", {
  year,
  metadata: [],
  tags: report.tags.map(({ name, colour, subgroups, sourceIds }) => ({
    name,
    colour,
    subgroups,
    sourceIds: [...new Set(sourceIds ?? [])],
  })),
});
const tagMap = preparedTags.tagMap;
console.log("Prepared tags.");

if (prepareOnly) {
  writeFileSync(
    path.resolve("coverage-tmp", "rollcall-import-result.json"),
    JSON.stringify({ preparedOnly: true, year, calendarYears }, null, 2)
  );
  process.exit(0);
}

const importEvents = report.events
  .map(({ sourceImportId, name, dateStart, dateEnd, subgroup, collaboration, tagIds, members }) => ({
    sourceImportId,
    name,
    dateStart,
    dateEnd,
    subgroup,
    collaboration,
    tagIds,
    members: members.map(
      ({ source, resolved, name, email, staffEmail, metadata, signInTime, notes }) => ({
        source,
        resolved,
        name,
        email,
        staffEmail,
        metadata: Object.fromEntries(
          Object.entries(metadata ?? {}).filter((entry) => typeof entry[1] === "string")
        ),
        signInTime,
        notes,
      })
    ),
  }))
  .filter((event) => !sourceGroup || event.sourceImportId.startsWith(`${sourceGroup}/`));

// Import one event at a time, splitting its attendees into chunks small enough
// to pass as a single CLI arg (a busy, metadata-rich event can blow Windows'
// ~32KB command-line limit). The event upsert is idempotent, so repeating it
// per chunk just accumulates attendance. If a chunk is still too long
// (ENAMETOOLONG) we halve it and recurse, so no event is ever too big to import.
const MEMBER_CHUNK_SIZE = 60;

function importMemberChunk(event, members) {
  try {
    const result = runConvex("rollcallImport:importEvents", {
      tagMap,
      fieldMapByYear,
      events: [{ ...event, members }],
    });
    return { attendance: result.importedAttendance, skipped: result.skipped };
  } catch (error) {
    const tooLong =
      error?.code === "ENAMETOOLONG" || /ENAMETOOLONG/.test(String(error));
    if (tooLong && members.length > 1) {
      const mid = Math.ceil(members.length / 2);
      const a = importMemberChunk(event, members.slice(0, mid));
      const b = importMemberChunk(event, members.slice(mid));
      return { attendance: a.attendance + b.attendance, skipped: a.skipped + b.skipped };
    }
    throw error;
  }
}

let importedEvents = 0;
let importedAttendance = 0;
let skipped = 0;
for (const event of importEvents) {
  const memberChunks = event.members.length
    ? chunks(event.members, MEMBER_CHUNK_SIZE)
    : [[]];
  for (const memberChunk of memberChunks) {
    const result = importMemberChunk(event, memberChunk);
    importedAttendance += result.attendance;
    skipped += result.skipped;
  }
  importedEvents++;
  console.log(
    `Imported events: ${importedEvents}/${importEvents.length} ` +
      `(attendance ${importedAttendance}, skipped ${skipped})`
  );
}

const summary = runConvex("rollcallImport:summary", { year });
const result = {
  year,
  calendarYears,
  importedEvents,
  importedAttendance,
  skipped,
  summary,
};
writeFileSync(
  path.resolve("coverage-tmp", "rollcall-import-result.json"),
  `${JSON.stringify(result, null, 2)}\n`
);
console.log(JSON.stringify(result, null, 2));
