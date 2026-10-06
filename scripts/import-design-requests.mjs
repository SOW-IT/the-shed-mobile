// Copies design requests (and their comments) from the old THE SHED web app's
// Firestore into Convex, through the internal designRequestImport:importLegacy
// mutation. Safe to re-run: requests are matched on their old year and id, and
// any that have been acted on in the new app are left alone.
//
//   node scripts/import-design-requests.mjs --dry-run          # read + summarise only
//   node scripts/import-design-requests.mjs                    # dev deployment (.env.local)
//   node scripts/import-design-requests.mjs --prod             # production
//   node scripts/import-design-requests.mjs --years=2026,2027  # only some staff years
//
// Reading Firestore needs a Google token for the theshedsow project: run
// `gcloud auth login` first, or set FIRESTORE_ACCESS_TOKEN.
import { execFileSync } from "node:child_process";
import path from "node:path";

const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID ?? "theshedsow";
const EARLIEST_YEAR = 2022;
const BATCH_SIZE = 20;
// Each batch is passed to `convex run` as one command-line argument, which the
// OS caps (128 KiB per argument on Linux), so a batch also flushes early when
// its JSON would pass this size.
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

const emailCache = new Map();
/** The email on the old user doc for `uid`, looked up in that year and its neighbours. */
async function userEmail(uid, year) {
  const key = `${uid}`;
  if (emailCache.has(key)) return emailCache.get(key);
  let email;
  for (const y of [year, year - 1, year + 1]) {
    const doc = await firestore(`${baseUrl}/users/users/${y}/${encodeURIComponent(uid)}`);
    const found = doc ? fieldsOf(doc).email : undefined;
    if (typeof found === "string" && found.includes("@")) {
      email = found;
      break;
    }
  }
  // Admins could provision people by email, in which case the id is the email.
  if (!email && uid.includes("@")) email = uid;
  emailCache.set(key, email);
  return email;
}

const STRING_FIELDS = [
  "department",
  "details",
  "theme",
  "example",
  "message",
  "extraInformation",
  "detailsOfEventOrProject",
  "approvedByHOD",
  "reason",
];
const NUMBER_FIELDS = ["dueDate", "approvedTime", "declinedTime", "completedTime"];
const FLAG_FIELDS = ["multipleDrafts", "runTheDesign", "completed"];

const pick = (fields, names, type) =>
  Object.fromEntries(
    names
      .filter((name) => {
        const value = fields[name];
        return type === "flag"
          ? typeof value === "boolean" || typeof value === "string"
          : typeof value === type;
      })
      .map((name) => [name, fields[name]])
  );

const checkboxes = (value) =>
  value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value).filter(
          ([, v]) => typeof v === "boolean" || typeof v === "string"
        )
      )
    : undefined;

async function legacyRequest(year, doc) {
  const fields = fieldsOf(doc);
  const id = docId(doc);
  const userID = typeof fields.userID === "string" ? fields.userID : "unknown";
  const comments = [];
  for (const commentDoc of await listDocuments(
    `designRequests/designRequests/${year}/${id}/comments`
  )) {
    const c = fieldsOf(commentDoc);
    if (typeof c.comment !== "string" || typeof c.submittedTime !== "number") continue;
    const author = typeof c.userID === "string" ? c.userID : "unknown";
    comments.push({
      id: docId(commentDoc),
      userID: author,
      userEmail: await userEmail(author, year),
      comment: c.comment,
      submittedTime: c.submittedTime,
    });
  }
  const request = {
    year,
    id,
    userID,
    userEmail: await userEmail(userID, year),
    ...pick(fields, STRING_FIELDS, "string"),
    ...pick(fields, NUMBER_FIELDS, "number"),
    ...pick(fields, FLAG_FIELDS, "flag"),
    type: checkboxes(fields.type),
    productType: checkboxes(fields.productType),
    submittedTime:
      typeof fields.submittedTime === "number"
        ? fields.submittedTime
        : Date.parse(doc.createTime),
    comments,
  };
  return Object.fromEntries(Object.entries(request).filter(([, v]) => v !== undefined));
}

function runImport(batch) {
  const convexMain = path.resolve("node_modules", "convex", "bin", "main.js");
  const output = execFileSync(
    process.execPath,
    [
      convexMain,
      "run",
      ...(prod ? ["--prod"] : []),
      "designRequestImport:importLegacy",
      JSON.stringify({ requests: batch }),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(output.slice(output.indexOf("{")));
}

const all = [];
for (const year of years) {
  const docs = await listDocuments(`designRequests/designRequests/${year}`);
  for (const doc of docs) all.push(await legacyRequest(year, doc));
  console.log(`${year}: ${docs.length} design requests`);
}
const unmatched = all.filter((r) => !r.userEmail).length;
console.log(
  `Read ${all.length} design requests with ${all.reduce((n, r) => n + r.comments.length, 0)} comments; ${unmatched} requesters have no email on their old user doc.`
);

if (dryRun) {
  console.log("Dry run: nothing written. Example:", JSON.stringify(all[0] ?? null, null, 2));
} else {
  const totals = { inserted: 0, updated: 0, skipped: 0, comments: 0 };
  let batch = [];
  const flush = () => {
    if (batch.length === 0) return;
    const counts = runImport(batch);
    for (const key of Object.keys(totals)) totals[key] += counts[key];
    batch = [];
  };
  for (const request of all) {
    const tooBig = JSON.stringify({ requests: [...batch, request] }).length > MAX_BATCH_BYTES;
    if (batch.length >= BATCH_SIZE || tooBig) flush();
    batch.push(request);
  }
  flush();
  console.log(`Imported into ${prod ? "production" : "dev"}:`, totals);
}
