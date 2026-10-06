// Copies event forms (the event plus its Marketing, Finance and old Risk forms)
// from the old THE SHED web app's Firestore into Convex, through the internal
// eventRequestImport:importLegacy mutation. Safe to re-run: events are matched
// on their old year and id, and any that have been acted on in the new app are
// left alone. The old Registration form isn't kept.
//
//   node scripts/import-event-requests.mjs --dry-run          # read + summarise only
//   node scripts/import-event-requests.mjs                    # dev deployment (.env.local)
//   node scripts/import-event-requests.mjs --prod             # production
//   node scripts/import-event-requests.mjs --years=2026,2027  # only some staff years
//
// Reading Firestore needs a Google token for the theshedsow project: run
// `gcloud auth login` first, or set FIRESTORE_ACCESS_TOKEN.
import { execFileSync } from "node:child_process";
import path from "node:path";

const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID ?? "theshedsow";
const EARLIEST_YEAR = 2023;
const BATCH_SIZE = 10;
// Each batch is passed to `convex run` as one command-line argument, which the
// OS caps (128 KiB per argument on Linux), so a batch also flushes early when
// its JSON would pass this many UTF-8 bytes.
const MAX_BATCH_BYTES = 100_000;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const prod = args.includes("--prod");
const yearsArg = args.find((arg) => arg.startsWith("--years="))?.split("=")[1];

/** The staff year rolls over on 1 October (Sydney); close enough for picking years. */
const currentStaffYear = () => {
  const now = new Date();
  return now.getUTCMonth() >= 9 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
};
const years = yearsArg
  ? yearsArg.split(",").map(Number)
  : Array.from(
      { length: currentStaffYear() - EARLIEST_YEAR + 1 },
      (_, i) => EARLIEST_YEAR + i
    );

const accessToken = () => {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN;
  try {
    return execFileSync("gcloud", ["auth", "print-access-token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new Error(
      "Could not get a Google access token. Run `gcloud auth login` (as an account with access to theshedsow), or set FIRESTORE_ACCESS_TOKEN."
    );
  }
};

const token = accessToken();
const baseUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

async function firestore(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }
  return await response.json();
}

/** Every document directly in a collection, following pages. */
async function listDocuments(collectionPath) {
  const docs = [];
  let pageToken;
  do {
    const url = new URL(`${baseUrl}/${collectionPath}`);
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await firestore(url.toString());
    docs.push(...(page?.documents ?? []));
    pageToken = page?.nextPageToken;
  } while (pageToken);
  return docs;
}

/** A Firestore REST value as plain JSON; timestamps become epoch ms. */
function plain(value) {
  if (value === undefined || value === null) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return Date.parse(value.timestampValue);
  if ("nullValue" in value) return undefined;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(plain);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {})
        .map(([key, field]) => [key, plain(field)])
        .filter(([, field]) => field !== undefined)
    );
  }
  return undefined;
}

const docId = (doc) => doc.name.split("/").at(-1);
const fieldsOf = (doc) => plain({ mapValue: { fields: doc.fields ?? {} } });

const userCache = new Map();
/** The email and department on the old user doc for `uid`, from that year or its neighbours. */
async function oldUser(uid, year) {
  if (userCache.has(uid)) return userCache.get(uid);
  let user = {};
  for (const y of [year, year - 1, year + 1]) {
    const doc = await firestore(`${baseUrl}/users/users/${y}/${encodeURIComponent(uid)}`);
    const fields = doc ? fieldsOf(doc) : undefined;
    if (typeof fields?.email === "string" && fields.email.includes("@")) {
      user = {
        email: fields.email,
        department: typeof fields.department === "string" ? fields.department : undefined,
      };
      break;
    }
  }
  // Admins could provision people by email, in which case the id is the email.
  if (!user.email && uid.includes("@")) user.email = uid;
  userCache.set(uid, user);
  return user;
}

const pick = (fields, names, type) =>
  Object.fromEntries(
    names.filter((name) => typeof fields[name] === type).map((name) => [name, fields[name]])
  );

const EVENT_TEXT = ["name", "purpose", "goals", "theme", "location", "audience", "notes"];
const EVENT_TIMES = [
  "eventStartTime",
  "eventEndTime",
  "registrationOpenTime",
  "registrationCloseTime",
  "updatedTime",
];
const BUDGET_TABLES = [
  "salesRevenues",
  "directExpenses",
  "indirectExpenses",
  "equipmentMaterials",
  "travelOthers",
];

const budgetRows = (rows) =>
  Array.isArray(rows)
    ? rows.map((row) => ({
        ...pick(row, ["type", "justification"], "string"),
        ...pick(row, ["unitPrice", "quantity", "total"], "number"),
      }))
    : undefined;

async function legacyEvent(year, doc) {
  const fields = fieldsOf(doc);
  const id = docId(doc);
  const userID = typeof fields.submittee === "string" ? fields.submittee : "unknown";
  const user = await oldUser(userID, year);
  const subForms = Object.fromEntries(
    (await listDocuments(`eventForm/eventForm/${year}/${id}/subForms`)).map((d) => [
      docId(d),
      fieldsOf(d),
    ])
  );
  const marketing = subForms.marketing
    ? Object.fromEntries(
        Object.entries(subForms.marketing).filter(([, v]) =>
          ["boolean", "string", "number"].includes(typeof v)
        )
      )
    : undefined;
  const finance = subForms.finance
    ? {
        ...pick(subForms.finance, ["status", "requestForChangeReason"], "string"),
        ...Object.fromEntries(
          BUDGET_TABLES.map((table) => [table, budgetRows(subForms.finance[table])]).filter(
            ([, rows]) => rows !== undefined
          )
        ),
      }
    : undefined;
  const risk = subForms.risk
    ? {
        ...pick(subForms.risk, ["status", "requestForChangeReason"], "string"),
        ...(Array.isArray(subForms.risk.entries)
          ? {
              entries: subForms.risk.entries.map((e) =>
                pick(
                  e,
                  ["task", "hazards", "riskIdentification", "proposedControlMeasures", "residualRiskLevel"],
                  "string"
                )
              ),
            }
          : {}),
      }
    : undefined;
  const event = {
    year,
    id,
    userID,
    userEmail: user.email,
    userDepartment: user.department,
    ...pick(fields, EVENT_TEXT, "string"),
    ...pick(fields, EVENT_TIMES, "number"),
    ...pick(fields, ["registrationGoal"], "number"),
    submittedTime:
      typeof fields.submittedTime === "number" ? fields.submittedTime : Date.parse(doc.createTime),
    marketing,
    finance,
    risk,
  };
  return Object.fromEntries(Object.entries(event).filter(([, v]) => v !== undefined));
}

function runImport(batch) {
  const convexMain = path.resolve("node_modules", "convex", "bin", "main.js");
  const output = execFileSync(
    process.execPath,
    [
      convexMain,
      "run",
      ...(prod ? ["--prod"] : []),
      "eventRequestImport:importLegacy",
      JSON.stringify({ events: batch }),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(output.slice(output.indexOf("{")));
}

const all = [];
for (const year of years) {
  const docs = await listDocuments(`eventForm/eventForm/${year}`);
  const events = [];
  for (const doc of docs) events.push(await legacyEvent(year, doc));
  // Numbered within their year in the order they were submitted.
  events
    .sort((a, b) => a.submittedTime - b.submittedTime || a.id.localeCompare(b.id))
    .forEach((event, i) => all.push({ ...event, number: i + 1 }));
  console.log(`${year}: ${docs.length} event forms`);
}
const unmatched = all.filter((e) => !e.userEmail).length;
console.log(
  `Read ${all.length} event forms; ${unmatched} requesters have no email on their old user doc.`
);

if (dryRun) {
  console.log(
    "Dry run: nothing written.",
    all.map((e) => `${e.year}/${e.id} #${e.number} ${e.name ?? "(no name)"}`).join("\n")
  );
} else {
  const totals = { inserted: 0, updated: 0, skipped: 0 };
  const bytes = (events) => Buffer.byteLength(JSON.stringify({ events }), "utf8");
  const tooLarge = [];
  let batch = [];
  const flush = () => {
    if (batch.length === 0) return;
    const counts = runImport(batch);
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    batch = [];
  };
  for (const event of all) {
    if (bytes([event]) > MAX_BATCH_BYTES) {
      tooLarge.push(`${event.year}/${event.id}`);
      continue;
    }
    if (batch.length >= BATCH_SIZE || bytes([...batch, event]) > MAX_BATCH_BYTES) flush();
    batch.push(event);
  }
  flush();
  if (tooLarge.length > 0) {
    console.error(
      `Not imported, too large to send in one go: ${tooLarge.join(", ")}. Raise MAX_BATCH_BYTES or import them separately.`
    );
    process.exitCode = 1;
  }
  console.log(`Imported into ${prod ? "production" : "dev"}:`, totals);
}
