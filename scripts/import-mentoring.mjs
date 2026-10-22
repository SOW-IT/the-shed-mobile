import { execFileSync } from "node:child_process";
import path from "node:path";

const PROJECT_ID = process.env.FIRESTORE_PROJECT_ID ?? "theshedsow";
const BATCH_SIZE = 50;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const prod = args.includes("--prod");
const yearsArg = args.find((arg) => arg.startsWith("--years="))?.split("=")[1];
const onlyYears = yearsArg ? new Set(yearsArg.split(",").map(Number)) : null;

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

const docId = (doc) => doc.name.split("/").at(-1);

const legacyPeople = new Map();
async function legacyPerson(uid, year) {
  const key = `${year}/${uid}`;
  if (legacyPeople.has(key)) return legacyPeople.get(key);
  let email;
  let name;
  for (const y of [year, year - 1, year + 1]) {
    const doc = await firestore(`${baseUrl}/users/users/${y}/${encodeURIComponent(uid)}`);
    const fields = doc?.fields ?? {};
    const found = fields.email?.stringValue;
    if (typeof found === "string" && found.includes("@")) {
      email = found;
      name = [fields.firstName?.stringValue, fields.lastName?.stringValue]
        .filter(Boolean)
        .join(" ")
        .trim();
      break;
    }
  }
  if (!email && uid.includes("@")) email = uid;
  const person = Object.fromEntries(
    Object.entries({ uid, email, name: name || undefined }).filter(([, v]) => v !== undefined)
  );
  legacyPeople.set(key, person);
  return person;
}

function runImport(pairs) {
  const convexMain = path.resolve("node_modules", "convex", "bin", "main.js");
  const output = execFileSync(
    process.execPath,
    [
      convexMain,
      "run",
      ...(prod ? ["--prod"] : []),
      "mentoringImport:importLegacy",
      JSON.stringify({ pairs }),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 16 * 1024 * 1024 }
  );
  return JSON.parse(output.slice(output.indexOf("{")));
}

const all = [];
for (const doc of await listDocuments("mentees")) {
  const year = Number(docId(doc));
  if (!Number.isInteger(year) || (onlyYears && !onlyYears.has(year))) continue;
  const map = doc.fields?.mentees?.mapValue?.fields ?? {};
  let count = 0;
  for (const [menteeUid, value] of Object.entries(map)) {
    const mentorUid = value.stringValue;
    if (!mentorUid) continue;
    all.push({
      year,
      mentee: await legacyPerson(menteeUid, year),
      mentor: await legacyPerson(mentorUid, year),
    });
    count++;
  }
  console.log(`${year}: ${count} pairings`);
}
const noEmail = all.filter((p) => !p.mentee.email || !p.mentor.email).length;
console.log(`Read ${all.length} pairings; ${noEmail} have a person with no email on their old user doc.`);

if (dryRun) {
  console.log("Dry run: nothing written.");
} else {
  const totals = { inserted: 0, updated: 0, kept: 0, externalsCreated: 0 };
  const skipped = [];
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const result = runImport(all.slice(i, i + BATCH_SIZE));
    for (const key of Object.keys(totals)) totals[key] += result[key];
    skipped.push(...result.skipped);
  }
  console.log(`Imported into ${prod ? "production" : "dev"}:`, totals);
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} pairings:`);
    for (const s of skipped) console.log(`  ${s.year}  ${s.email ?? s.uid}  (${s.reason})`);
  }
}
