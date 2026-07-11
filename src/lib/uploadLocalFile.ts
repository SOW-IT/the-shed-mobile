import { File } from "expo-file-system";
import { Platform } from "react-native";
import { Id } from "../../convex/_generated/dataModel";

export type LocalUploadSource = {
  uri: string;
  mimeType?: string | null;
};

const mimeFromUri = (uri: string): string | null => {
  const path = uri.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".heic")) return "image/heic";
  if (path.endsWith(".pdf")) return "application/pdf";
  return null;
};

/** Prefer the picker MIME, then a Blob type / URI extension — never assume JPEG. */
const resolveContentType = (
  mimeType: string | null | undefined,
  uri: string,
  blobType?: string | null
): string =>
  mimeType?.trim() || blobType?.trim() || mimeFromUri(uri) || "application/octet-stream";

/**
 * Byte length of a local file URI.
 *
 * On native, React Native's `fetch(uri).blob()` throws
 * "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported",
 * so we read size via expo-file-system instead.
 */
export async function getLocalFileSizeBytes(uri: string): Promise<number> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(uri)).blob();
    return blob.size;
  }
  const file = new File(uri);
  if (!file.exists) {
    throw new Error("That file could not be read. Try picking it again.");
  }
  return file.size;
}

/**
 * POST a local file to a Convex `generateUploadUrl` endpoint and return the
 * storage id. Uses expo-file-system's binary upload on native (avoids RN Blob)
 * and the browser Blob path on web.
 */
export async function uploadLocalFileToUrl(
  uploadUrl: string,
  source: LocalUploadSource
): Promise<Id<"_storage">> {
  if (Platform.OS === "web") {
    const blob = await (await fetch(source.uri)).blob();
    const contentType = resolveContentType(source.mimeType, source.uri, blob.type);
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    if (!response.ok) throw new Error("Upload failed");
    const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
    return storageId;
  }

  const file = new File(source.uri);
  if (!file.exists) {
    throw new Error("That file could not be read. Try picking it again.");
  }
  const contentType = resolveContentType(source.mimeType, source.uri);
  const result = await file.upload(uploadUrl, {
    httpMethod: "POST",
    mimeType: contentType,
    headers: { "Content-Type": contentType },
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error("Upload failed");
  }
  let storageId: Id<"_storage"> | undefined;
  try {
    storageId = (JSON.parse(result.body) as { storageId?: Id<"_storage"> }).storageId;
  } catch {
    throw new Error("Upload failed");
  }
  if (!storageId) throw new Error("Upload failed");
  return storageId;
}
