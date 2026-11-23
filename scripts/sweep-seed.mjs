#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const SWEEP_PEOPLE = {
  admin: "sweep.admin@sow.org.au",
  staff: "sweep.staff@sow.org.au",
  leader: "sweep.leader@sow.org.au",
  finance: "sweep.finance@sow.org.au",
};

const UNSW = "University of New South Wales";

const run = (fn, args, identity) => {
  const argv = ["convex", "run", fn, JSON.stringify(args)];
  if (process.env.CONVEX_ENV_FILE) argv.push("--env-file", process.env.CONVEX_ENV_FILE);
  if (identity) argv.push("--identity", JSON.stringify({ email: identity, subject: identity, issuer: "sweep" }));
  const out = execFileSync("npx", argv, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  const trimmed = out.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
};

const staffYearNow = () => {
  const sydney = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  return sydney.getMonth() >= 9 ? sydney.getFullYear() + 1 : sydney.getFullYear();
};

const admin = SWEEP_PEOPLE.admin;
run("admin:seed", { adminEmail: admin });
const year = staffYearNow();
run("admin:upsertDepartment", { year, name: "Marketing", division: "Engagement", headEmail: SWEEP_PEOPLE.staff }, admin);
run("admin:setStaffProfile", { year, email: SWEEP_PEOPLE.staff, roles: ["Head of Department"], department: "Marketing" }, admin);
run("admin:upsertDepartment", { year, name: "Finance", division: "Governance", headEmail: SWEEP_PEOPLE.finance }, admin);
run("admin:setStaffProfile", { year, email: SWEEP_PEOPLE.finance, roles: ["Head of Department"], department: "Finance" }, admin);
run("admin:setBudgetManager", { year, email: SWEEP_PEOPLE.finance }, admin);
run("admin:upsertUniversity", { year, name: UNSW }, admin);
run("admin:setStaffProfile", { year, email: SWEEP_PEOPLE.leader, roles: ["Student Leader"], university: UNSW }, admin);

// Forty more people on staff who have never been in the Garden, so its
// "Not here right now" list has more than one page to load. One import, not
// forty runs.
const POKE_LIST = [
  "Abel", "Bree", "Cody", "Dara", "Eli", "Fern", "Gus", "Hana", "Ira", "Jae",
  "Kit", "Lena", "Milo", "Nia", "Otis", "Pia", "Quinn", "Remy", "Sol", "Tess",
  "Uma", "Vic", "Wren", "Xavi", "Yara", "Zed", "Ari", "Bo", "Cleo", "Dev",
  "Esme", "Finn", "Gia", "Hugo", "Isla", "Joon", "Kai", "Lior", "Mae", "Noor",
];
const staffDir = mkdtempSync(join(tmpdir(), "sweep-staff-"));
const staffFile = join(staffDir, "staff.jsonl");
writeFileSync(staffFile, POKE_LIST.map((first, i) => JSON.stringify({ email: `sweep.person${i}@sow.org.au`, name: `${first} Sweep`, year })).join("\n"));
const importArgs = ["convex", "import", "--table", "staffProfiles", "--append", "-y", staffFile];
if (process.env.CONVEX_ENV_FILE) importArgs.push("--env-file", process.env.CONVEX_ENV_FILE);
execFileSync("npx", importArgs, { stdio: ["ignore", "ignore", "inherit"] });
rmSync(staffDir, { recursive: true, force: true });

const now = Number(process.env.SWEEP_NOW) || Date.now();
const eventId = run(
  "events:create",
  { name: "Sweep weekly", dateStart: now - 60 * 60 * 1000, dateEnd: now + 60 * 60 * 1000, subgroups: [UNSW] },
  SWEEP_PEOPLE.leader
);
const memberId = run("attendanceMembers:create", { name: "Sweep Member", metadata: { Campus: UNSW } }, SWEEP_PEOPLE.leader);
run("attendance:signIn", { eventId, memberId }, SWEEP_PEOPLE.leader);
run("requests:submit", { description: "Sweep reimbursement", amount: 42 }, SWEEP_PEOPLE.staff);
const checkInToken = run("checkIn:enable", { eventId }, SWEEP_PEOPLE.leader);
// The calendar shows a deadline and an entry running over several days.
const DAY = 24 * 60 * 60 * 1000;
run(
  "calendar:addEntry",
  { name: "Sweep deadline", dateStart: now + DAY, dateEnd: now + DAY, due: "time" },
  SWEEP_PEOPLE.staff
);
run(
  "calendar:addEntry",
  { name: "Sweep camp", dateStart: now, dateEnd: now + 2 * DAY },
  SWEEP_PEOPLE.staff
);

// Enough scores that the games' leaderboards run past their first page, with
// the admin's own best part way down Mystic Man's.
const LEADERBOARD_PLAYERS = 40;
const scores = [];
for (const game of ["shooter", "runner"]) {
  for (let i = 0; i < LEADERBOARD_PLAYERS; i++) {
    const player = `sweep.player${String(i + 1).padStart(2, "0")}`;
    scores.push({ email: `${player}@sow.org.au`, game, score: 5000 - i * 100, runId: `seed-${game}-${player}` });
  }
}
scores.push({ email: admin, game: "runner", score: 2050, runId: "seed-runner-admin" });
const scoreDir = mkdtempSync(join(tmpdir(), "sweep-scores-"));
const scoreFile = join(scoreDir, "gameScores.jsonl");
writeFileSync(
  scoreFile,
  scores.map((row) => JSON.stringify({ ...row, durationMs: 60_000, playedAt: now - DAY, updatedAt: now - DAY })).join("\n")
);
const importArgs = ["convex", "import", "--table", "gameScores", "--append", "--yes", scoreFile];
if (process.env.CONVEX_ENV_FILE) importArgs.push("--env-file", process.env.CONVEX_ENV_FILE);
try {
  execFileSync("npx", importArgs, { stdio: ["ignore", "ignore", "inherit"] });
} finally {
  rmSync(scoreDir, { recursive: true, force: true });
}

const seeded = { year, eventId, memberId, checkInToken, people: SWEEP_PEOPLE };
writeFileSync(process.env.SWEEP_SEED_OUT ?? "sweep-seed.json", JSON.stringify(seeded, null, 2));
console.log(JSON.stringify(seeded));
