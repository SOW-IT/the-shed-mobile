const MANIFEST_VERSION = 1;
export const DEFAULT_PREFIX = "storage";
export const DEFAULT_PAGE_SIZE = 100;
const FALLBACK_CONTENT_TYPE = "application/octet-stream";

export const emptyManifest = () => ({
  version: MANIFEST_VERSION,
  updatedAt: null,
  files: {},
  deleted: {},
});

export const parseManifest = (text) => {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || parsed.version !== MANIFEST_VERSION) {
    throw new Error(
      `Unsupported storage manifest (expected version ${MANIFEST_VERSION}, got ${parsed?.version})`
    );
  }
  return {
    version: MANIFEST_VERSION,
    updatedAt: parsed.updatedAt ?? null,
    files: parsed.files ?? {},
    deleted: parsed.deleted ?? {},
  };
};

const BASE64_DIGEST = /^[A-Za-z0-9+/]{43}=$/;

export const sha256Hex = (sha256) => {
  if (/^[0-9a-f]{64}$/i.test(sha256)) return sha256.toLowerCase();
  if (typeof sha256 !== "string" || !BASE64_DIGEST.test(sha256)) {
    throw new Error(`Not a SHA-256 digest: ${sha256}`);
  }
  return Array.from(atob(sha256), (char) => char.charCodeAt(0).toString(16).padStart(2, "0")).join(
    ""
  );
};

export const manifestObject = (prefix) => `${prefix}/manifest.json`;
export const fileObject = (prefix, sha256) => `${prefix}/files/${sha256}`;

export const parseConvexRunOutput = (stdout) => {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`convex run printed no JSON result:\n${stdout.trim()}`);
  return JSON.parse(stdout.slice(start));
};

export const knownShas = (manifest) =>
  new Set(
    [...Object.values(manifest.files), ...Object.values(manifest.deleted)].map(
      (entry) => entry.sha256
    )
  );

export const summaryLine = (summary) =>
  `Storage backup: ${summary.total} file(s) in Convex, ${summary.new} new, ${summary.skipped} already in GCS, ${summary.missing} newly missing from Convex (${summary.deleted} kept in GCS after deletion), ${summary.failed} failed`;

export const backupStorageFiles = async ({
  manifest,
  prefix = DEFAULT_PREFIX,
  listPage,
  download,
  upload,
  today,
  warn = () => {},
  onPage = async () => {},
}) => {
  const next = { version: MANIFEST_VERSION, updatedAt: today, files: {}, deleted: { ...manifest.deleted } };
  const shas = knownShas(manifest);
  const seen = new Set();
  const summary = { total: 0, new: 0, skipped: 0, missing: 0, deleted: 0, failed: 0 };

  let cursor = null;
  for (;;) {
    const page = await listPage(cursor);
    for (const file of page.files) {
      summary.total++;
      seen.add(file.storageId);
      let sha256;
      try {
        sha256 = sha256Hex(file.sha256);
      } catch (error) {
        summary.failed++;
        warn(`Skipping ${file.storageId}: ${error.message}`);
        continue;
      }
      const entry = {
        ...(manifest.files[file.storageId] ?? {
          storageId: file.storageId,
          sha256,
          size: file.size,
          contentType: file.contentType ?? null,
          firstSeen: today,
          object: fileObject(prefix, sha256),
        }),
        lastSeen: today,
      };
      if (shas.has(sha256)) {
        summary.skipped++;
        next.files[file.storageId] = entry;
        continue;
      }
      if (!file.url) {
        summary.failed++;
        warn(`Skipping ${file.storageId}: Convex returned no download url`);
        continue;
      }
      try {
        const downloaded = await download(file.url, file.storageId);
        if (downloaded.sha256 !== sha256) {
          throw new Error(
            `downloaded ${downloaded.size} byte(s) hashing ${downloaded.sha256}, Convex recorded ${sha256}`
          );
        }
        await upload(downloaded.path, entry.object, {
          contentType: file.contentType ?? FALLBACK_CONTENT_TYPE,
          storageId: file.storageId,
        });
        shas.add(sha256);
        summary.new++;
        next.files[file.storageId] = entry;
      } catch (error) {
        summary.failed++;
        warn(`Could not back up ${file.storageId}: ${error.message}`);
      }
    }
    await onPage({
      ...next,
      files: { ...manifest.files, ...next.files },
      deleted: { ...next.deleted },
    });
    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  for (const [storageId, entry] of Object.entries(manifest.files)) {
    if (seen.has(storageId)) continue;
    next.deleted[storageId] = { ...entry, lastSeen: entry.lastSeen ?? manifest.updatedAt ?? today };
    summary.missing++;
  }
  summary.deleted = Object.keys(next.deleted).length;
  return { manifest: next, summary };
};
