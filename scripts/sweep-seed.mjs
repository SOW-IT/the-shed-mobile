#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export const SWEEP_PEOPLE = {
  admin: "sweep.admin@sow.org.au",
  staff: "sweep.staff@sow.org.au",
  leader: "sweep.leader@sow.org.au",
};

const UNSW = "University of New South Wales";

const run = (fn, args, identity) => {
  const argv = ["convex", "run", fn, JSON.stringify(args)];
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
run("admin:upsertUniversity", { year, name: UNSW }, admin);
run("admin:setStaffProfile", { year, email: SWEEP_PEOPLE.leader, roles: ["Student Leader"], university: UNSW }, admin);

const now = Date.now();
const eventId = run(
  "events:create",
  { name: "Sweep weekly", dateStart: now - 60 * 60 * 1000, dateEnd: now + 60 * 60 * 1000, subgroups: [UNSW] },
  SWEEP_PEOPLE.leader
);
const memberId = run("attendanceMembers:create", { name: "Sweep Member", metadata: { Campus: UNSW } }, SWEEP_PEOPLE.leader);
run("attendance:signIn", { eventId, memberId }, SWEEP_PEOPLE.leader);
run("requests:submit", { description: "Sweep reimbursement", amount: 42 }, SWEEP_PEOPLE.staff);
const checkInToken = run("checkIn:enable", { eventId }, SWEEP_PEOPLE.leader);

const seeded = { year, eventId, memberId, checkInToken, people: SWEEP_PEOPLE };
writeFileSync("sweep-seed.json", JSON.stringify(seeded, null, 2));
console.log(JSON.stringify(seeded));
