#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PREFIX,
  backupStorageFiles,
  emptyManifest,
  manifestObject,
  parseConvexRunOutput,
  parseManifest,
  summaryLine,
} from "./lib/backupStorageFiles.mjs";
import { makeRunner } from "./lib/loadConvexSnapshot.mjs";

const usage = `Usage:
  node scripts/backup-storage-files.mjs --bucket <gcs-bucket>

Copies every Convex storage file that is not yet in
gs://<bucket>/<prefix>/files/<sha256> there, once, and keeps
gs://<bucket>/<prefix>/manifest.json as the record of what was copied.
Needs CONVEX_DEPLOY_KEY (or a configured deployment) and an authenticated gcloud.

Options:
  --bucket <name>        GCS bucket (default $GCS_BACKUP_BUCKET)
  --prefix <path>        Object prefix inside the bucket (default ${DEFAULT_PREFIX})
  --page-size <n>        Files per Convex query page (default ${DEFAULT_PAGE_SIZE})
  --deployment <name>    Convex deployment to read (default: --prod)
  --convex-bin <path>    Convex CLI entry point (default node_modules/convex/bin/main.js)
  --today <yyyy-mm-dd>   Date recorded as firstSeen/lastSeen (default: today, UTC)
`;

const parseArgs = (argv) => {
  const args = {
    bucket: process.env.GCS_BACKUP_BUCKET ?? null,
    prefix: DEFAULT_PREFIX,
    pageSize: DEFAULT_PAGE_SIZE,
    deployment: null,
    convexBin: resolve("node_modules", "convex", "bin", "main.js"),
    today: new Date().toISOString().slice(0, 10),
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    switch (flag) {
      case "--bucket":
        args.bucket = next;
        i++;
        break;
      case "--prefix":
        args.prefix = next;
        i++;
        break;
      case "--page-size":
        args.pageSize = Number(next);
        i++;
        break;
      case "--deployment":
        args.deployment = next;
        i++;
        break;
      case "--convex-bin":
        args.convexBin = resolve(next);
        i++;
        break;
      case "--today":
        args.today = next;
        i++;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${flag}\n${usage}`);
    }
  }
  return args;
};

const DOWNLOAD_ATTEMPTS = 3;
const MISSING_OBJECT = /(?:URLs? )?matched no objects/i;
const DOWNLOAD_TIMEOUT_MS = 120_000;

const run = makeRunner(spawnSync);

const readManifest = (gsPath, localPath) => {
  const result = run("gcloud", ["storage", "cp", gsPath, localPath], { allowFailure: true });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (MISSING_OBJECT.test(output)) return emptyManifest();
    throw new Error(`Could not read ${gsPath}:\n${output}`);
  }
  return parseManifest(readFileSync(localPath, "utf8"));
};

const writeManifest = (manifest, gsPath, localPath) => {
  writeFileSync(localPath, `${JSON.stringify(manifest, null, 2)}\n`);
  run("gcloud", ["storage", "cp", localPath, gsPath, "--content-type=application/json"]);
};

const makeListPage = ({ convexBin, deployment, pageSize }) => (cursor) => {
  const result = run(process.execPath, [
    convexBin,
    "run",
    ...(deployment ? ["--deployment", deployment] : ["--prod"]),
    "--typecheck",
    "disable",
    "--codegen",
    "disable",
    "storageBackup:listFiles",
    JSON.stringify({ cursor, numItems: pageSize }),
  ]);
  return parseConvexRunOutput(result.stdout ?? "");
};

const downloadOnce = async (url, dest) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok || !response.body) {
    const error = new Error(`HTTP ${response.status} fetching the file from Convex`);
    error.permanent = response.status >= 400 && response.status < 500;
    throw error;
  }
  const hash = createHash("sha256");
  let size = 0;
  const count = new Transform({
    transform(chunk, _encoding, callback) {
      hash.update(chunk);
      size += chunk.length;
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), count, createWriteStream(dest));
  return { sha256: hash.digest("hex"), size, path: dest };
};

const makeDownload = (workDir) => async (url, storageId) => {
  const dest = join(workDir, storageId);
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadOnce(url, dest);
    } catch (error) {
      rmSync(dest, { force: true });
      if (error.permanent || attempt >= DOWNLOAD_ATTEMPTS) throw error;
      process.stderr.write(`Download of ${storageId} failed (attempt ${attempt}/${DOWNLOAD_ATTEMPTS}): ${error.message}; retrying\n`);
    }
  }
};

const makeUpload = (bucket) => async (localPath, object, { contentType, storageId }) => {
  run("gcloud", [
    "storage",
    "cp",
    "--no-clobber",
    `--content-type=${contentType}`,
    `--custom-metadata=convex-storage-id=${storageId}`,
    localPath,
    `gs://${bucket}/${object}`,
  ]);
  rmSync(localPath, { force: true });
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }
  if (!args.bucket) throw new Error(`A bucket is required.\n${usage}`);
  if (!Number.isInteger(args.pageSize) || args.pageSize < 1) {
    throw new Error(`--page-size must be a positive integer.\n${usage}`);
  }

  const workDir = mkdtempSync(join(tmpdir(), "convex-storage-backup-"));
  const manifestLocal = join(workDir, "manifest.json");
  const manifestRemote = `gs://${args.bucket}/${manifestObject(args.prefix)}`;
  try {
    const manifest = readManifest(manifestRemote, manifestLocal);
    process.stdout.write(
      `Manifest ${manifestRemote}: ${Object.keys(manifest.files).length} file(s), ${Object.keys(manifest.deleted).length} deleted, last updated ${manifest.updatedAt ?? "never"}\n`
    );
    const result = await backupStorageFiles({
      manifest,
      prefix: args.prefix,
      listPage: makeListPage(args),
      download: makeDownload(workDir),
      upload: makeUpload(args.bucket),
      today: args.today,
      warn: (message) => process.stderr.write(`${message}\n`),
      onPage: async (checkpoint) => writeManifest(checkpoint, manifestRemote, manifestLocal),
    });
    writeManifest(result.manifest, manifestRemote, manifestLocal);
    process.stdout.write(`${summaryLine(result.summary)}\n`);
    if (result.summary.failed > 0) process.exitCode = 1;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
};

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
