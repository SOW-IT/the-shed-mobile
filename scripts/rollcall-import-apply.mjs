import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPORT_PATH = path.resolve(
  "coverage-tmp",
  process.argv.find((arg) => arg.startsWith("--report="))?.split("=")[1] ??
    "rollcall-import-dry-run.json"
);
const MEMBER_CHUNK_SIZE = 10;
const year = Number(process.argv.find((arg) => arg.startsWith("--year="))?.split("=")[1] ?? 2026);
const eventsOnly = process.argv.includes("--events-only");
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

function runConvex(functionName, args) {
  const jsonArgs = JSON.stringify(args);
  const output = execFileSync(
    command,
    [convexMain, "run", "--push", "--identity", identity, functionName, jsonArgs],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
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

if (report.duplicateCount > 0) {
  console.log(`Importing with ${report.duplicateCount} duplicate-name groups kept separate.`);
}

const preparedMetadata = runConvex("rollcallImport:prepare", {
  year,
  metadata: report.metadata.map(({ key, type, order, values, subgroup, sourceIds }) => ({
    key,
    type,
    order,
    values,
    subgroup,
    sourceIds: [...new Set(sourceIds ?? [])],
  })),
  tags: [],
});
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
const prepared = {
  fieldMap: preparedMetadata.fieldMap,
  tagMap: preparedTags.tagMap,
};
console.log("Prepared metadata/tags.");
if (prepareOnly) {
  writeFileSync(
    path.resolve("coverage-tmp", "rollcall-import-result.json"),
    JSON.stringify({ preparedOnly: true, year }, null, 2)
  );
  process.exit(0);
}

const importMembers = report.members.map(
  ({ sourceImportId, name, email, staffEmail, subgroup, metadata }) => ({
    sourceImportId,
    name,
    email: staffEmail ?? email,
    subgroup,
    metadata: Object.fromEntries(
      Object.entries(metadata ?? {}).filter((entry) => typeof entry[1] === "string")
    ),
  })
);
const canonicalByEmail = new Map();
for (const member of importMembers) {
  if (member.email) canonicalByEmail.set(member.email, member.sourceImportId);
}
const memberAliasMap = Object.fromEntries(
  importMembers
    .filter(
      (member) =>
        member.email &&
        canonicalByEmail.get(member.email) &&
        canonicalByEmail.get(member.email) !== member.sourceImportId
    )
    .map((member) => [member.sourceImportId, canonicalByEmail.get(member.email)])
);
const importEvents = report.events.map(
  ({ sourceImportId, name, dateStart, dateEnd, subgroup, collaboration, tagIds, members }) => ({
    sourceImportId,
    name,
    dateStart,
    dateEnd,
    subgroup,
    collaboration,
    tagIds,
    members,
  })
).filter((event) => !sourceGroup || event.sourceImportId.startsWith(`${sourceGroup}/`));

let importedMembers = 0;
let staffOverlays = 0;
if (!eventsOnly) {
  for (const chunk of chunks(importMembers, MEMBER_CHUNK_SIZE)) {
    const result = runConvex("rollcallImport:importMembers", {
      year,
      fieldMap: prepared.fieldMap,
      members: chunk,
    });
    importedMembers += result.imported;
    staffOverlays += result.staffOverlays;
    console.log(`Imported members: ${importedMembers}/${importMembers.length}`);
  }
}

let importedEvents = 0;
let importedAttendance = 0;
for (const chunk of chunks(importEvents, 1)) {
  const result = runConvex("rollcallImport:importEvents", {
    year,
    tagMap: prepared.tagMap,
    memberAliasMap,
    events: chunk,
  });
  importedEvents += result.importedEvents;
  importedAttendance += result.importedAttendance;
  console.log(`Imported events: ${importedEvents}/${importEvents.length}`);
}

const summary = runConvex("rollcallImport:summary", { year });
const mergeLegacy =
  eventsOnly
    ? undefined
    : runConvex("rollcallImport:mergeLegacyStaffMembers", { year });
const result = {
  year,
  duplicateCount: report.duplicateCount,
  importedMembers,
  staffOverlays,
  importedEvents,
  importedAttendance,
  mergeLegacy,
  summary,
};
writeFileSync(
  path.resolve("coverage-tmp", "rollcall-import-result.json"),
  `${JSON.stringify(result, null, 2)}\n`
);
console.log(JSON.stringify(result, null, 2));
