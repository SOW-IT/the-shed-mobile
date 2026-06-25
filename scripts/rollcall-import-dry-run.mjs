import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const SOW_SUBGROUP = "SOW";

const UNIVERSITY_IDS = {
  "ccSgQTXvLRnin0OjwvRM": "University of New South Wales",
  CZHRnKJ8SDnfMIw64WJu: "Macquarie University",
  MUSmSaufEfgdJUX4Kx4G: "University of Sydney",
  wrsDV3XfwQB4RD7BxKD2: "University of Technology, Sydney",
  T4qzZ5X3pGqJgJ8CMOtk: SOW_SUBGROUP,
};
const GLOBAL_METADATA_KEYS = new Set(["role", "year", "gender", "campus", "notes"]);

const sourceGroupIdToSubgroup = (groupId) => UNIVERSITY_IDS[groupId] ?? undefined;

const scopedSubgroupsFromSources = (sources) => [
  ...new Set((sources ?? []).map(sourceGroupIdToSubgroup).filter(Boolean)),
];

const DEFAULT_OLD_ENV = path.resolve(
  "..",
  "time-to-rollcall",
  "frontend",
  ".env"
);
const DEFAULT_EXPORT_DIR = path.resolve(
  "coverage-tmp",
  "2026-06-24T00_49_58_72049"
);
const GLOBAL_TAG_NAMES = new Set([
  "ppn",
  "roadtrip",
  "seasons",
  "twig",
  "social",
  "weekly meeting",
]);

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, all) => {
    if (!arg.startsWith("--")) return [];
    const [key, inline] = arg.slice(2).split("=");
    return [[key, inline ?? all[index + 1]]];
  })
);

const envPath = path.resolve(args.get("env") ?? DEFAULT_OLD_ENV);
const exportDir = path.resolve(args.get("export") ?? DEFAULT_EXPORT_DIR);
const year = Number(args.get("year") ?? new Date().getFullYear());
const OUT_PATH = path.resolve(
  "coverage-tmp",
  args.get("out") ?? "rollcall-import-dry-run.json"
);

function readVarint(buffer, start) {
  let index = start;
  let shift = 0;
  let value = 0n;
  while (index < buffer.length) {
    const byte = buffer[index++];
    value |= BigInt(byte & 0x7f) << BigInt(shift);
    if ((byte & 0x80) === 0) {
      const number = Number(value);
      return { value: number, index };
    }
    shift += 7;
  }
  throw new Error("Unterminated varint in Firestore export.");
}

function readProtoFields(buffer) {
  const fields = [];
  let index = 0;
  while (index < buffer.length) {
    const key = readVarint(buffer, index);
    index = key.index;
    const field = key.value >> 3;
    const wire = key.value & 7;
    if (wire === 0) {
      const read = readVarint(buffer, index);
      fields.push({ field, wire, value: read.value });
      index = read.index;
    } else if (wire === 1) {
      fields.push({ field, wire, raw: buffer.subarray(index, index + 8) });
      index += 8;
    } else if (wire === 2) {
      const length = readVarint(buffer, index);
      index = length.index;
      fields.push({
        field,
        wire,
        raw: buffer.subarray(index, index + length.value),
      });
      index += length.value;
    } else if (wire === 5) {
      fields.push({ field, wire, raw: buffer.subarray(index, index + 4) });
      index += 4;
    } else if (wire === 3 || wire === 4) {
      // Group delimiters appear inside encoded references. They are not useful
      // for field extraction, so keep scanning.
      fields.push({ field, wire });
    } else {
      break;
    }
  }
  return fields;
}

function utf8(raw) {
  try {
    return Buffer.from(raw).toString("utf8");
  } catch {
    return "";
  }
}

function printableStrings(raw) {
  return [...Buffer.from(raw).toString("latin1").matchAll(/[ -~]{1,}/g)].map(
    (match) => match[0]
  );
}

function pathFromKey(raw) {
  const buffer = Buffer.from(raw);
  const parts = [];
  for (let index = 0; index < buffer.length - 3; index++) {
    if (buffer[index] === 0x12) {
      const kindLength = buffer[index + 1];
      const kindStart = index + 2;
      const kindEnd = kindStart + kindLength;
      const nameTag = buffer[kindEnd];
      const nameLength = buffer[kindEnd + 1];
      if (nameTag === 0x22 && kindEnd + 2 + nameLength <= buffer.length) {
        parts.push(
          buffer.subarray(kindStart, kindEnd).toString("utf8"),
          buffer.subarray(kindEnd + 2, kindEnd + 2 + nameLength).toString("utf8")
        );
      }
    }
    if (buffer[index] === 0x7a) {
      const kindLength = buffer[index + 1];
      const kindStart = index + 2;
      const kindEnd = kindStart + kindLength;
      if (buffer[kindEnd] === 0x8a && buffer[kindEnd + 1] === 0x01) {
        const nameLength = buffer[kindEnd + 2];
        const nameStart = kindEnd + 3;
        if (nameStart + nameLength <= buffer.length) {
          parts.push(
            buffer.subarray(kindStart, kindEnd).toString("utf8"),
            buffer.subarray(nameStart, nameStart + nameLength).toString("utf8")
          );
        }
      }
    }
  }
  if (parts.length > 0) return parts;
  const strings = printableStrings(raw)
    .map((value) => value.replace(/[^A-Za-z0-9_-]+$/g, ""))
    .filter(Boolean);
  const start = strings.indexOf("groups");
  return start >= 0 ? strings.slice(start) : strings;
}

function valueFromRaw(raw, propertyName) {
  const fields = readProtoFields(raw);
  const field1 = fields.find((f) => f.field === 1 && f.wire === 0)?.value;
  const field3 = fields.find((f) => f.field === 3 && f.wire === 2)?.raw;

  if (propertyName === "dateStart" || propertyName === "dateEnd") {
    return typeof field1 === "number" ? field1 / 1000 : undefined;
  }
  if (propertyName === "signInTime") {
    return typeof field1 === "number" ? field1 / 1000 : undefined;
  }
  if (field3) {
    const text = utf8(field3);
    const printable =
      text.length > 0 &&
      [...text].every((char) => {
        const code = char.charCodeAt(0);
        return code === 10 || code === 13 || code === 9 || code >= 32;
      });
    if (printable) return text;
    return entityFromPayload(field3).properties;
  }

  const path = pathFromKey(raw);
  if (path.includes("groups")) return path;
  if (typeof field1 === "number") return field1;
  return undefined;
}

function propertyFromRaw(raw) {
  const fields = readProtoFields(raw);
  const nameRaw = fields.find((f) => f.field === 3 && f.wire === 2)?.raw;
  const valueRaw = fields.find((f) => f.field === 5 && f.wire === 2)?.raw;
  if (!nameRaw || !valueRaw) return null;
  const name = utf8(nameRaw);
  return [name, valueFromRaw(valueRaw, name)];
}

function entityFromPayload(payload) {
  const fields = readProtoFields(payload);
  const keyRaw = fields.find((f) => f.field === 13 && f.wire === 2)?.raw;
  const properties = {};
  for (const field of fields.filter((f) => f.field === 15 && f.wire === 2)) {
    const property = propertyFromRaw(field.raw);
    if (!property) continue;
    const [key, value] = property;
    if (properties[key] === undefined) {
      properties[key] = value;
    } else if (Array.isArray(properties[key])) {
      properties[key].push(value);
    } else {
      properties[key] = [properties[key], value];
    }
  }
  return { path: keyRaw ? pathFromKey(keyRaw) : [], properties };
}

function readExportPayloads(root) {
  const shardDir = path.join(root, "all_namespaces", "all_kinds");
  const shardNames = readdirSync(shardDir)
    .filter((name) => /^output-\d+$/.test(name))
    .sort((a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]));
  const payloads = [];
  for (const shardName of shardNames) {
    const buffer = readFileSync(path.join(shardDir, shardName));
    let offset = 0;
    let parts = [];
    while (offset + 7 <= buffer.length) {
      const length = buffer.readUInt16LE(offset + 4);
      const type = buffer[offset + 6];
      const payload = buffer.subarray(offset + 7, offset + 7 + length);
      offset += 7 + length;
      if (type === 1) payloads.push(payload);
      else if (type === 2) parts = [payload];
      else if (type === 3) parts.push(payload);
      else if (type === 4) {
        parts.push(payload);
        payloads.push(Buffer.concat(parts));
        parts = [];
      }
    }
  }
  return payloads;
}

function listDocsFromExport(root) {
  const docs = [];
  for (const payload of readExportPayloads(root)) {
    const entity = entityFromPayload(payload);
    const pathParts = entity.path;
    if (pathParts[0] !== "groups") continue;
    docs.push({
      id: pathParts.at(-1),
      collectionPath: pathParts.slice(0, -1).join("/"),
      pathParts,
      ...entity.properties,
    });
  }
  return docs;
}

function readDotEnv(filePath) {
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);
    if (!match) continue;
    out[match[1].trim()] = match[2].trim().replace(/^"|"$/g, "");
  }
  return out;
}

function accessToken() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN;
  const gcloudCommands =
    process.platform === "win32" ? ["gcloud.cmd", "gcloud"] : ["gcloud"];
  const firebaseCommands =
    process.platform === "win32" ? ["firebase.cmd", "firebase"] : ["firebase"];
  for (const command of gcloudCommands) {
    try {
      return execFileSync(command, ["auth", "print-access-token"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    } catch {
      // Try the next credential source.
    }
  }
  for (const command of firebaseCommands) {
    try {
      const login = JSON.parse(
        execFileSync(command, ["login:list", "--json"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      );
      const token = login.result?.[0]?.tokens?.access_token;
      if (typeof token === "string" && token) return token;
    } catch {
      // Try the next command name.
    }
  }
  throw new Error(
    "Could not get a Firestore access token. Run `gcloud auth login`, `firebase login`, or set FIRESTORE_ACCESS_TOKEN."
  );
}

const oldEnv = existsSync(envPath) ? readDotEnv(envPath) : {};
const projectId = oldEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "local-export";
if (!projectId && !existsSync(exportDir)) {
  throw new Error(`Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in ${envPath}`);
}

const exportDocs = existsSync(exportDir) ? listDocsFromExport(exportDir) : null;
const token = exportDocs ? null : accessToken();
const baseUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

async function firestoreGet(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return await response.json();
}

function docId(name) {
  return name.split("/").at(-1);
}

function decodeValue(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("referenceValue" in value) return value.referenceValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, child]) => [
        key,
        decodeValue(child),
      ])
    );
  }
  return undefined;
}

function decodeDoc(doc) {
  return {
    id: docId(doc.name),
    path: doc.name,
    ...Object.fromEntries(
      Object.entries(doc.fields ?? {}).map(([key, value]) => [key, decodeValue(value)])
    ),
  };
}

async function listDocs(collectionPath) {
  if (exportDocs) {
    return exportDocs.filter((doc) => doc.collectionPath === collectionPath);
  }
  const docs = [];
  let pageToken = "";
  do {
    const separator = collectionPath.includes("?") ? "&" : "?";
    const url = `${baseUrl}/${collectionPath}${separator}pageSize=300${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""
    }`;
    const page = await firestoreGet(url);
    docs.push(...(page.documents ?? []).map(decodeDoc));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return docs;
}

function normaliseText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * The staff year an event belongs to — the SOW staff year rolls over on
 * October 1 (Sydney), matching shared/flow.ts `staffYearForDate` and how the
 * live app stores `events.year` (convex/events.ts). So an event is bucketed
 * here exactly as it would be if created in the app: Oct–Dec of year N-1 and
 * Jan–Sep of year N both land in staff year N.
 *
 * This now coincides with the old web app's member roster, which also rolled
 * over ~October 1 (groups/<g>/members/<year>/members). They are still kept
 * decoupled in code — an attendance row's member is resolved against whichever
 * source roster its reference actually points at (see memberDocBySourceId) and
 * embedded on the event — so a future divergence wouldn't break bucketing.
 * Verified against the 2026-06 export.
 *
 * NOTE: historical `events.year` values already imported under the previous
 * Sept-1 boundary were bucketed one calendar year later for September events; a
 * re-run with this Oct-1 rule re-buckets those, which is intentional alignment
 * with the new rollover but is a data change to be aware of.
 */
function eventStaffYear(dateValue) {
  const sydney = new Date(new Date(dateValue).getTime() + 10 * 60 * 60 * 1000);
  return sydney.getUTCMonth() >= 9
    ? sydney.getUTCFullYear() + 1
    : sydney.getUTCFullYear();
}

function memberDuplicateKey(member) {
  const email =
    typeof member.email === "string" && member.email.includes("@")
      ? normaliseText(member.email)
      : "";
  if (email) return `email:${email}`;
  return `name:${normaliseText(member.name)}`;
}

function validEmail(value) {
  return typeof value === "string" && value.includes("@")
    ? value.trim().toLowerCase()
    : undefined;
}

/** Keep in sync with shared/rollcallImport.ts */
function canonicalImportMemberName(name) {
  const trimmed = String(name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (trimmed.toLowerCase() === "daniel kim snr") return "Daniel Kim";
  return trimmed;
}

function canonicalStaffEmailFromLegacy(member) {
  const displayName = String(member.name ?? "").trim();
  if (displayName.toLowerCase() === "daniel kim snr") {
    return "daniel.kim@sow.org.au";
  }
  const email = validEmail(member.email);
  if (!email?.endsWith("@sowaustralia.com")) return null;
  const localPart = email.slice(0, -"@sowaustralia.com".length);
  if (!localPart.includes(".")) return null;
  return `${localPart}@sow.org.au`;
}

function resolveImportStaffEmail(member) {
  return canonicalStaffEmailFromLegacy(member) ?? validEmail(member.email);
}

function sourceReferenceId(referencePath) {
  if (Array.isArray(referencePath) && referencePath[0] === "groups") {
    const groupId = referencePath[1];
    if (referencePath[2] === "tags") return `${groupId}/tags/${referencePath[3]}`;
    if (referencePath[2] === "members") {
      return `${groupId}/members/${referencePath[3]}/members/${referencePath[5]}`;
    }
  }
  if (typeof referencePath === "string") return referencePath.split("/").slice(-4).join("/");
  return undefined;
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function asRepeatedReference(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) && value[0] === "groups") return [value];
  return Array.isArray(value) ? value : [value];
}

const groups = (await listDocs("groups")).filter((group) => {
  const id = normaliseText(group.id);
  const name = normaliseText(group.name);
  return !id.includes("test") && !name.includes("test");
});

const metadataByKey = new Map();
const tagsByName = new Map();
const members = [];
const events = [];
// Every source member doc across the rosters a staff year's events can point
// at, keyed by its full sourceImportId (`<g>/members/<rosterYear>/members/<id>`)
// — exactly what `sourceReferenceId(row.member)` produces. The Oct 1 staff year
// now lines up with the web app's ~Oct 1 member roster, but that roster boundary
// is imprecise, so an event near the rollover may reference the adjacent roster
// (N-1 or N+1). Load N-1, N and N+1 and resolve each attendance reference against
// whichever it names. Extra rosters are harmless — matching is by exact
// sourceImportId, never a fuzzy guess.
const memberDocBySourceId = new Map();
const ROSTER_YEARS = [year - 1, year, year + 1];

for (const group of groups) {
  const subgroup = UNIVERSITY_IDS[group.id] ?? group.name ?? group.id;
  const [metadata, tags, groupEvents, ...rosters] = await Promise.all([
    listDocs(`groups/${group.id}/metadata`),
    listDocs(`groups/${group.id}/tags`),
    listDocs(`groups/${group.id}/events`),
    ...ROSTER_YEARS.map((rosterYear) =>
      listDocs(`groups/${group.id}/members/${rosterYear}/members`)
    ),
  ]);

  for (const field of metadata) {
    const key = field.key?.trim();
    if (!key) continue;
    const existing = metadataByKey.get(key.toLowerCase());
    metadataByKey.set(key.toLowerCase(), {
      key,
      type: field.type ?? existing?.type ?? "input",
      order: Math.min(field.order ?? 999, existing?.order ?? 999),
      values: { ...(existing?.values ?? {}), ...(field.values ?? {}) },
      sources: [...(existing?.sources ?? []), group.id],
      sourceIds: [...(existing?.sourceIds ?? []), field.id],
    });
  }

  for (const tag of tags) {
    const name = tag.name?.trim();
    if (!name) continue;
    const existing = tagsByName.get(name.toLowerCase());
    tagsByName.set(name.toLowerCase(), {
      name,
      colour: existing?.colour ?? tag.colour,
      subgroups: GLOBAL_TAG_NAMES.has(name.toLowerCase())
        ? undefined
        : scopedSubgroupsFromSources([...(existing?.sources ?? []), group.id]),
      colourConflict:
        existing?.colour && tag.colour && existing.colour !== tag.colour
          ? [existing.colour, tag.colour]
          : existing?.colourConflict,
      sources: [...(existing?.sources ?? []), group.id],
      sourceIds: [...(existing?.sourceIds ?? []), `${group.id}/tags/${tag.id}`],
    });
  }

  ROSTER_YEARS.forEach((rosterYear, index) => {
    for (const member of rosters[index]) {
      const sourceImportId = `${group.id}/members/${rosterYear}/members/${member.id}`;
      const enriched = {
        ...member,
        sourceGroupId: group.id,
        sourceGroupName: group.name,
        subgroup,
        rosterYear,
        sourceImportId,
      };
      memberDocBySourceId.set(sourceImportId, enriched);
      // The sign-in pool for this staff year is its own roster (rosterYear ===
      // year); the adjacent rosters are loaded only to resolve references from
      // events that sit near the imprecise ~Oct 1 roster boundary.
      if (rosterYear === year) members.push(enriched);
    }
  });

  for (const event of groupEvents) {
    if (event.dateStart && eventStaffYear(event.dateStart) !== year) continue;
    events.push({
      sourceGroupId: group.id,
      sourceGroupName: group.name,
      subgroup,
      id: event.id,
      sourceImportId: `${group.id}/events/${event.id}`,
      name: event.name,
      dateStart: event.dateStart,
      dateEnd: event.dateEnd,
      tagIds: asRepeatedReference(event.tags).map(sourceReferenceId).filter(Boolean),
      collaboration: asArray(event.collaboration)
        .map((id) => {
          const mapped = UNIVERSITY_IDS[id] ?? id;
          return mapped === "ALL" ? SOW_SUBGROUP : mapped;
        })
        .filter(Boolean),
      // Keep the raw attendance references for now; they're resolved against the
      // complete member map in a second pass below (a reference can point at a
      // member in a group that hasn't been loaded yet).
      members: asArray(event.members).map((row) => ({
        source: sourceReferenceId(row.member),
        signInTime: row.signInTime,
        notes: row.notes,
      })),
    });
  }
}

// Second pass: now that every group's rosters are loaded, resolve each
// attendance reference and embed the member's identity + metadata, so the
// import never has to guess which roster year a reference lives in.
// `resolved: false` flags a reference whose member doc is in neither roster
// (genuinely dangling source data).
for (const event of events) {
  event.members = event.members.map((row) => {
    const doc = row.source ? memberDocBySourceId.get(row.source) : undefined;
    const rawName =
      typeof doc?.name === "string" ? doc.name.trim() : String(doc?.name ?? "");
    const email = validEmail(doc?.email);
    return {
      source: row.source,
      resolved: Boolean(doc),
      name: doc ? canonicalImportMemberName(rawName) : undefined,
      email,
      staffEmail: doc ? resolveImportStaffEmail({ name: rawName, email }) : undefined,
      metadata: doc?.metadata && typeof doc.metadata === "object" ? doc.metadata : {},
      signInTime: row.signInTime,
      notes: row.notes,
    };
  });
}

// A few source event docs parse to a non-unique id (e.g. several SOW-group
// events share the doc id "placeholder"), which would collapse them onto one
// row under the importer's upsert-by-sourceImportId. Disambiguate every member
// of a colliding id with its start time so no event is silently dropped.
const eventIdCounts = new Map();
for (const event of events) {
  eventIdCounts.set(
    event.sourceImportId,
    (eventIdCounts.get(event.sourceImportId) ?? 0) + 1
  );
}
for (const event of events) {
  if ((eventIdCounts.get(event.sourceImportId) ?? 0) > 1) {
    event.sourceImportId = `${event.sourceImportId}#${event.dateStart}`;
  }
}

const membersByDuplicateKey = new Map();
for (const member of members) {
  const key = memberDuplicateKey(member);
  membersByDuplicateKey.set(key, [...(membersByDuplicateKey.get(key) ?? []), member]);
}

const duplicates = [...membersByDuplicateKey.entries()]
  .filter(([key, rows]) => key !== "name:" && rows.length > 1)
  .map(([key, rows]) => ({
    key,
    rows: rows.map((row) => ({
      sourceGroupId: row.sourceGroupId,
      sourceGroupName: row.sourceGroupName,
      id: row.id,
      name: row.name,
      email: row.email,
    })),
  }));

const report = {
  projectId,
  year,
  source: {
    envPath,
    groups: groups.map((group) => ({ id: group.id, name: group.name })),
  },
  counts: {
    groups: groups.length,
    metadataFields: metadataByKey.size,
    tags: tagsByName.size,
    sourceMembers: members.length,
    sourceEvents: events.length,
    sourceAttendanceRows: events.reduce(
      (sum, event) => sum + (event.members?.length ?? 0),
      0
    ),
  },
  metadata: [...metadataByKey.values()]
    .map((field) => {
      const subgroups = scopedSubgroupsFromSources(field.sources);
      return {
        ...field,
        subgroup:
          GLOBAL_METADATA_KEYS.has(field.key.toLowerCase()) || subgroups.length !== 1
            ? undefined
            : subgroups[0],
      };
    })
    .sort((a, b) => a.order - b.order),
  tags: [...tagsByName.values()].sort((a, b) => a.name.localeCompare(b.name)),
  duplicates,
  duplicateCount: duplicates.length,
  members: members.map((member) => {
    const rawName =
      typeof member.name === "string" ? member.name.trim() : String(member.name ?? "");
    const name = canonicalImportMemberName(rawName);
    const email = validEmail(member.email);
    const staffEmail = resolveImportStaffEmail({ name: rawName, email });
    return {
      sourceGroupId: member.sourceGroupId,
      sourceGroupName: member.sourceGroupName,
      subgroup: member.subgroup,
      id: member.id,
      sourceImportId: member.sourceImportId,
      name,
      email,
      staffEmail,
      metadata: member.metadata && typeof member.metadata === "object" ? member.metadata : {},
    };
  }),
  events,
};

mkdirSync(path.dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Wrote ${OUT_PATH}`);
console.log(JSON.stringify(report.counts, null, 2));
if (duplicates.length > 0) {
  console.log(`Duplicate members: ${duplicates.length}`);
  for (const duplicate of duplicates) {
    console.log(`- ${duplicate.key}: ${duplicate.rows.map((r) => r.name).join(", ")}`);
  }
  process.exitCode = 2;
}
