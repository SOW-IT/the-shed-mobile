import { execFileSync } from "node:child_process";
import path from "node:path";

const year = Number(
  process.argv.find((arg) => arg.startsWith("--year="))?.split("=")[1] ??
    new Date().getFullYear()
);
const email =
  process.env.ROLLCALL_IMPORT_EMAIL ??
  process.argv.find((arg) => arg.startsWith("--email="))?.split("=")[1] ??
  "daniel.kim@sow.org.au";

const command = process.execPath;
const convexMain = path.resolve("node_modules", "convex", "bin", "main.js");
const identity = JSON.stringify({
  email,
  subject: email,
  issuer: "rollcall-import",
});

const output = execFileSync(
  command,
  [
    convexMain,
    "run",
    "--push",
    "--identity",
    identity,
    "rollcallImport:migrateOrgWideSubgroupToSow",
    JSON.stringify({ year }),
  ],
  { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
);

const jsonStart = output.indexOf("{");
if (jsonStart === -1) {
  console.log(output.trim());
} else {
  console.log(JSON.stringify(JSON.parse(output.slice(jsonStart)), null, 2));
}
