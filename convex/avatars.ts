"use node";

import { v } from "convex/values";
import { decode as decodeJpeg, encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";

export const AVATAR_MAX_EDGE = 256;
const AVATAR_JPEG_QUALITY = 82;
const DECODE_MEMORY_MB = 400;
const MAX_JPEG_SAMPLES = 16_000_000;
const MAX_PNG_PIXELS = 10_000_000;
const EXIF_ORIENTATION_TAG = 0x0112;
const START_OF_FRAME = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

type Pixels = { width: number; height: number; data: Uint8Array };
export type JpegFrame = { width: number; height: number; samples: number };

const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8;

const isPng = (bytes: Uint8Array) =>
  bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

const isExifHeader = (bytes: Uint8Array, at: number) =>
  bytes[at] === 0x45 &&
  bytes[at + 1] === 0x78 &&
  bytes[at + 2] === 0x69 &&
  bytes[at + 3] === 0x66 &&
  bytes[at + 4] === 0 &&
  bytes[at + 5] === 0;

function tiffOrientation(bytes: Uint8Array, tiff: number): number {
  const little = bytes[tiff] === 0x49;
  const u16 = (at: number) =>
    little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
  const u32 = (at: number) =>
    little ? u16(at) + u16(at + 2) * 0x10000 : u16(at) * 0x10000 + u16(at + 2);
  const ifd = tiff + u32(tiff + 4);
  const entries = ifd + 2 <= bytes.length ? u16(ifd) : 0;
  for (let i = 0; i < entries; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > bytes.length) break;
    if (u16(entry) !== EXIF_ORIENTATION_TAG) continue;
    const value = u16(entry + 8);
    return value >= 1 && value <= 8 ? value : 1;
  }
  return 1;
}

function* jpegSegments(bytes: Uint8Array) {
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) return;
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    yield { marker, start: offset + 4, end: Math.min(offset + 2 + length, bytes.length) };
    offset += 2 + length;
  }
}

export function jpegOrientation(bytes: Uint8Array): number {
  for (const { marker, start } of jpegSegments(bytes)) {
    if (marker === 0xe1 && isExifHeader(bytes, start)) return tiffOrientation(bytes, start + 6);
  }
  return 1;
}

export function jpegFrame(bytes: Uint8Array): JpegFrame | null {
  for (const { marker, start, end } of jpegSegments(bytes)) {
    if (!START_OF_FRAME.has(marker)) continue;
    const componentCount = bytes[start + 5];
    if (!componentCount || start + 6 + componentCount * 3 > end) return null;
    const height = (bytes[start + 1] << 8) | bytes[start + 2];
    const width = (bytes[start + 3] << 8) | bytes[start + 4];
    const factors = Array.from({ length: componentCount }, (_, i) => bytes[start + 7 + i * 3]);
    const maxH = Math.max(1, ...factors.map((factor) => factor >> 4));
    const maxV = Math.max(1, ...factors.map((factor) => factor & 0x0f));
    const sampleShare =
      factors.reduce((sum, factor) => sum + (factor >> 4) * (factor & 0x0f), 0) / (maxH * maxV);
    return { width, height, samples: Math.round(width * height * sampleShare) };
  }
  return null;
}

export const pngSize = (bytes: Uint8Array) => {
  const u32 = (at: number) =>
    bytes[at] * 0x1000000 + ((bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]);
  return { width: u32(16), height: u32(20) };
};

function sourceIndex(
  orientation: number,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  switch (orientation) {
    case 2:
      return y * width + (width - 1 - x);
    case 3:
      return (height - 1 - y) * width + (width - 1 - x);
    case 4:
      return (height - 1 - y) * width + x;
    case 5:
      return x * width + y;
    case 6:
      return (height - 1 - x) * width + y;
    case 7:
      return (height - 1 - x) * width + (width - 1 - y);
    case 8:
      return x * width + (width - 1 - y);
    default:
      return y * width + x;
  }
}

export function shrinkPixels(source: Pixels, orientation: number, maxEdge: number): Pixels {
  const turned = orientation >= 5 && orientation <= 8;
  const uprightWidth = turned ? source.height : source.width;
  const uprightHeight = turned ? source.width : source.height;
  const scale = Math.max(1, Math.max(uprightWidth, uprightHeight) / maxEdge);
  const width = Math.max(1, Math.round(uprightWidth / scale));
  const height = Math.max(1, Math.round(uprightHeight / scale));
  const data = new Uint8Array(width * height * 4);
  for (let ty = 0; ty < height; ty++) {
    const y0 = Math.floor((ty * uprightHeight) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((ty + 1) * uprightHeight) / height));
    for (let tx = 0; tx < width; tx++) {
      const x0 = Math.floor((tx * uprightWidth) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((tx + 1) * uprightWidth) / width));
      let red = 0;
      let green = 0;
      let blue = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = sourceIndex(orientation, x, y, source.width, source.height) * 4;
          const alpha = source.data[i + 3] / 255;
          const white = 255 * (1 - alpha);
          red += source.data[i] * alpha + white;
          green += source.data[i + 1] * alpha + white;
          blue += source.data[i + 2] * alpha + white;
        }
      }
      const samples = (y1 - y0) * (x1 - x0);
      const out = (ty * width + tx) * 4;
      data[out] = Math.round(red / samples);
      data[out + 1] = Math.round(green / samples);
      data[out + 2] = Math.round(blue / samples);
      data[out + 3] = 255;
    }
  }
  return { width, height, data };
}

function decode(bytes: Uint8Array): { pixels: Pixels; orientation: number } | null {
  if (isJpeg(bytes)) {
    const frame = jpegFrame(bytes);
    if (!frame) throw new Error("Couldn't find the JPEG's size");
    if (frame.samples > MAX_JPEG_SAMPLES) {
      throw new Error(`${frame.width}x${frame.height} JPEG is too large to decode in an action`);
    }
    const pixels = decodeJpeg(bytes, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: DECODE_MEMORY_MB,
    });
    return { pixels, orientation: jpegOrientation(bytes) };
  }
  if (isPng(bytes)) {
    const { width, height } = pngSize(bytes);
    if (width * height > MAX_PNG_PIXELS) {
      throw new Error(`${width}x${height} PNG is too large to decode in an action`);
    }
    const png = PNG.sync.read(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    return { pixels: { width: png.width, height: png.height, data: png.data }, orientation: 1 };
  }
  return null;
}

export function shrinkAvatarBytes(bytes: Uint8Array): Uint8Array | null {
  const decoded = decode(bytes);
  if (!decoded) return null;
  const small = shrinkPixels(decoded.pixels, decoded.orientation, AVATAR_MAX_EDGE);
  const encoded = new Uint8Array(encodeJpeg(small, AVATAR_JPEG_QUALITY).data);
  return encoded.length < bytes.length ? encoded : null;
}

export const shrink = internalAction({
  args: { userId: v.id("users"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, { userId, storageId }) => {
    const blob = await ctx.storage.get(storageId);
    if (!blob) return null;
    let smaller: Uint8Array | null;
    try {
      smaller = shrinkAvatarBytes(new Uint8Array(await blob.arrayBuffer()));
    } catch (error) {
      console.warn(`Couldn't shrink avatar ${storageId}`, error);
      return null;
    }
    if (!smaller) return null;
    const shrunkId = await ctx.storage.store(
      new Blob([smaller as BlobPart], { type: "image/jpeg" })
    );
    await ctx.runMutation(internal.profile.replaceAvatar, {
      userId,
      from: storageId,
      to: shrunkId,
    });
    return null;
  },
});

export const shrinkAll = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const avatars: { userId: Id<"users">; storageId: Id<"_storage"> }[] = await ctx.runQuery(
      internal.profile.avatarsToShrink,
      {}
    );
    for (const avatar of avatars) {
      await ctx.scheduler.runAfter(0, internal.avatars.shrink, avatar);
    }
    return avatars.length;
  },
});
