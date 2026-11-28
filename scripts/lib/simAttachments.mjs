// Maestro drives the simulator through XCTest, and testmanagerd keeps every
// run's attachments in its own container's tmp/Attachments. Nothing reads
// them afterwards (Maestro writes its own output to --test-output-dir), and
// by 28 Nov 2026 the verify simulator had 23 GB of them in 732 folders. After
// each iOS phase, still holding the simulator lock, verify empties that one
// folder and touches nothing else on the simulator.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const METADATA = ".com.apple.mobile_container_manager.metadata.plist";
const TESTMANAGERD = "com.apple.testmanagerd";

/** A container's identifier from its metadata plist, or "" when it has none. */
const plistIdentifier = (plist) => {
  const result = spawnSync("plutil", ["-extract", "MCMMetadataIdentifier", "raw", plist], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
};

/**
 * Empties testmanagerd's tmp/Attachments on the simulator whose data folder is
 * `deviceData` (…/CoreSimulator/Devices/<udid>/data). The container is found
 * by its metadata identifier, not its UUID. Returns how many entries it removed.
 */
export const clearTestAttachments = (deviceData, identifierOf = plistIdentifier) => {
  const daemons = join(deviceData, "Containers/Data/InternalDaemon");
  if (!existsSync(daemons)) return 0;
  let removed = 0;
  for (const entry of readdirSync(daemons, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const container = join(daemons, entry.name);
    const plist = join(container, METADATA);
    if (!existsSync(plist) || identifierOf(plist) !== TESTMANAGERD) continue;
    const attachments = join(container, "tmp/Attachments");
    if (!existsSync(attachments)) continue;
    for (const item of readdirSync(attachments)) {
      rmSync(join(attachments, item), { recursive: true, force: true });
      removed++;
    }
  }
  return removed;
};
