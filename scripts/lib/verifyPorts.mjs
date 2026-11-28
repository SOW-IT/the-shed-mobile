// The ports one verify run serves on. Web-only runs in other worktrees no
// longer wait for the simulator lock, so two runs can be going at once. Each
// run reserves its ports in ~/.cache/theshed-verify/ports/, one lock file per
// port taken the same way as the simulator lock (verifyLock.mjs), and gives
// them back when it stops. A port that another process listens on, or that
// another live run has reserved, is skipped. A run killed outright leaves its
// files behind; the next run takes them over once the holder's pid is gone.
import { join } from "node:path";
import { release, tryAcquire } from "./verifyLock.mjs";

// Node's fetch refuses these ports (undici's bad-ports list, 1024 and up), so
// the readiness checks would time out against them.
const FETCH_BLOCKED_PORTS = new Set([
  1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669,
  6679, 6697, 10080,
]);
// Daniel's Metro. Never picked, even when nothing listens on it.
const NEVER = new Set([8081]);

/** The port in `value` (from env var `name`), or null when it isn't set. */
export const parsePort = (name, value) => {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error(`${name}=${value} isn't a port`);
  if (FETCH_BLOCKED_PORTS.has(n)) throw new Error(`${name}=${value} is a port Node's fetch refuses; pick another`);
  if (NEVER.has(n)) throw new Error(`${name}=${value} is Daniel's Metro port; pick another`);
  return n;
};

/**
 * Reserves a port for each role in `roles` ({ name, variable, preferred }).
 * A role whose `variable` is set in `env` gets that port, and fails when
 * another run has reserved it. Otherwise it gets the first port from
 * `preferred` up (within `span`) that nobody listens on (`listening(port)`)
 * and no live run has reserved. Returns `{ ports, release }`; `release` gives
 * every reservation back and is safe to call twice.
 */
export const reservePorts = ({ roles, env, dir, record, listening, span = 100, startOf }) => {
  const held = [];
  const giveBack = () => {
    for (const file of held.splice(0)) release(file, record);
  };
  const reserve = (port) => {
    const file = join(dir, `${port}.lock`);
    if (!tryAcquire(file, record, startOf).ok) return false;
    held.push(file);
    return true;
  };
  const ports = {};
  const taken = new Set();
  try {
    for (const { name, variable, preferred } of roles) {
      const fixed = parsePort(variable, env[variable]);
      if (fixed !== null) {
        if (taken.has(fixed)) throw new Error(`${variable}=${fixed} is already this run's ${Object.keys(ports).find((key) => ports[key] === fixed)} port`);
        if (!reserve(fixed)) throw new Error(`${variable}=${fixed} is reserved by another verify run; unset it to pick a free port`);
        ports[name] = fixed;
        taken.add(fixed);
        continue;
      }
      let chosen = null;
      for (let port = preferred; port < preferred + span && chosen === null; port++) {
        if (taken.has(port) || FETCH_BLOCKED_PORTS.has(port) || NEVER.has(port) || listening(port)) continue;
        if (reserve(port)) chosen = port;
      }
      if (chosen === null) throw new Error(`no free port for ${name} in ${preferred}-${preferred + span - 1}; set ${variable}`);
      ports[name] = chosen;
      taken.add(chosen);
    }
  } catch (error) {
    giveBack();
    throw error;
  }
  return { ports, release: giveBack };
};
