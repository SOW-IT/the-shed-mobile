import { convexTest, type TestConvex } from "convex-test";
import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  AVATAR_MAX_EDGE,
  jpegFrame,
  jpegOrientation,
  pngSize,
  shrinkAvatarBytes,
  shrinkPixels,
} from "./avatars";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const noise = (width: number, height: number, seed = 7) => {
  const data = new Uint8Array(width * height * 4);
  let state = seed;
  for (let i = 0; i < data.length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    data[i] = i % 4 === 3 ? 255 : state & 0xff;
  }
  return { width, height, data };
};

const bigJpeg = (width = 900, height = 600) =>
  new Uint8Array(encodeJpeg(noise(width, height), 95).data);

const exifSegment = (orientation: number, littleEndian: boolean, tag = 0x0112) => {
  const u16 = (n: number) => (littleEndian ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
  const u32 = (n: number) =>
    littleEndian
      ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24]
      : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42),
    ...u32(8),
    ...u16(1),
    ...u16(tag),
    ...u16(3),
    ...u32(1),
    ...u16(orientation),
    0,
    0,
    ...u32(0),
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const length = payload.length + 2;
  return [0xff, 0xe1, length >> 8, length & 0xff, ...payload];
};

const withSegments = (jpeg: Uint8Array, ...segments: number[][]) =>
  new Uint8Array([0xff, 0xd8, ...segments.flat(), ...jpeg.slice(2)]);

const tiny = new Uint8Array(encodeJpeg(noise(2, 2), 5).data);

const frameSegment = (width: number, height: number, factors = [0x22, 0x11, 0x11]) => {
  const components = factors.flatMap((factor, i) => [i + 1, factor, 0]);
  const length = 8 + components.length;
  return [
    0xff,
    0xc0,
    length >> 8,
    length & 0xff,
    8,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    factors.length,
    ...components,
  ];
};

const pngHeader = (width: number, height: number) => {
  const u32 = (n: number) => [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  const bytes = new Uint8Array(200_000);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  bytes.set([...u32(width), ...u32(height)], 16);
  return bytes;
};

describe("jpegOrientation", () => {
  test("reads the EXIF orientation in either byte order", () => {
    expect(jpegOrientation(withSegments(tiny, exifSegment(6, false)))).toBe(6);
    expect(jpegOrientation(withSegments(tiny, exifSegment(8, true)))).toBe(8);
  });

  test("skips other segments before the EXIF one", () => {
    const comment = [0xff, 0xfe, 0x00, 0x05, 0x68, 0x69, 0x21];
    expect(jpegOrientation(withSegments(tiny, comment, exifSegment(3, false)))).toBe(3);
  });

  test("is upright without EXIF, with an out-of-range value, or with no orientation tag", () => {
    expect(jpegOrientation(tiny)).toBe(1);
    expect(jpegOrientation(withSegments(tiny, exifSegment(9, false)))).toBe(1);
    expect(jpegOrientation(withSegments(tiny, exifSegment(6, false, 0x010f)))).toBe(1);
    const notExif = [0xff, 0xe1, 0x00, 0x08, 0x58, 0x4d, 0x50, 0x00, 0x00, 0x00];
    expect(jpegOrientation(withSegments(tiny, notExif))).toBe(1);
  });

  test("stops at a truncated EXIF block instead of reading past the end", () => {
    const segment = exifSegment(6, false);
    const cut = new Uint8Array([0xff, 0xd8, ...segment.slice(0, segment.length - 8)]);
    expect(jpegOrientation(cut)).toBe(1);
    const noEntries = new Uint8Array([0xff, 0xd8, ...segment.slice(0, 18)]);
    expect(jpegOrientation(noEntries)).toBe(1);
  });
});

describe("jpegFrame", () => {
  test("counts every colour sample, so subsampled chroma costs less than full colour", () => {
    expect(jpegFrame(withSegments(tiny, frameSegment(5712, 4284)))).toEqual({
      width: 5712,
      height: 4284,
      samples: 5712 * 4284 * 1.5,
    });
    expect(jpegFrame(withSegments(tiny, frameSegment(100, 50, [0x11, 0x11, 0x11])))?.samples).toBe(
      100 * 50 * 3
    );
    expect(jpegFrame(tiny)).toEqual({ width: 2, height: 2, samples: 12 });
  });

  test("skips the segments before the frame header", () => {
    const comment = [0xff, 0xfe, 0x00, 0x05, 0x68, 0x69, 0x21];
    expect(jpegFrame(withSegments(tiny, comment, frameSegment(640, 480)))?.width).toBe(640);
  });

  test("is unknown without a frame header, or with one cut short", () => {
    expect(jpegFrame(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull();
    expect(jpegFrame(new Uint8Array([0xff, 0xd8, ...frameSegment(640, 480).slice(0, 12)]))).toBeNull();
    expect(jpegFrame(new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x08, 8, 0, 1, 0, 1, 0]))).toBeNull();
  });
});

describe("pngSize", () => {
  test("reads the width and height from the IHDR chunk", () => {
    expect(pngSize(pngHeader(4032, 3024))).toEqual({ width: 4032, height: 3024 });
    expect(pngSize(pngHeader(0x80000001, 1)).width).toBe(0x80000001);
  });
});

describe("shrinkPixels", () => {
  const grid = {
    width: 2,
    height: 2,
    data: new Uint8Array([10, 0, 0, 255, 20, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255]),
  };
  const reds = (pixels: { data: Uint8Array }) =>
    Array.from(pixels.data.filter((_, i) => i % 4 === 0));

  test.each([
    [1, [10, 20, 30, 40]],
    [2, [20, 10, 40, 30]],
    [3, [40, 30, 20, 10]],
    [4, [30, 40, 10, 20]],
    [5, [10, 30, 20, 40]],
    [6, [30, 10, 40, 20]],
    [7, [40, 20, 30, 10]],
    [8, [20, 40, 10, 30]],
  ])("turns EXIF orientation %i upright", (orientation, expected) => {
    expect(reds(shrinkPixels(grid, orientation, AVATAR_MAX_EDGE))).toEqual(expected);
  });

  test("averages each block when it shrinks, and swaps width and height for a quarter turn", () => {
    const wide = {
      width: 4,
      height: 2,
      data: new Uint8Array(
        [0, 0, 100, 100, 100, 100, 200, 200].flatMap((red) => [red, red, red, 255])
      ),
    };
    const small = shrinkPixels(wide, 1, 2);
    expect([small.width, small.height]).toEqual([2, 1]);
    expect(reds(small)).toEqual([50, 150]);
    const turned = shrinkPixels(wide, 6, 2);
    expect([turned.width, turned.height]).toEqual([1, 2]);
  });

  test("puts see-through pixels on white", () => {
    const clear = { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) };
    expect(Array.from(shrinkPixels(clear, 1, 10).data)).toEqual([255, 255, 255, 255]);
  });
});

describe("shrinkAvatarBytes", () => {
  test("re-encodes a large JPEG as a small one no bigger than the max edge", () => {
    const original = withSegments(bigJpeg(900, 600), exifSegment(6, false));
    const shrunk = shrinkAvatarBytes(original)!;
    expect(shrunk.length).toBeLessThan(original.length / 4);
    expect(shrunk[0]).toBe(0xff);
    expect(shrunk[1]).toBe(0xd8);
  });

  test("turns a PNG into a JPEG", () => {
    const png = new PNG({ width: 600, height: 600 });
    png.data.set(noise(600, 600).data);
    const bytes = new Uint8Array(PNG.sync.write(png));
    const shrunk = shrinkAvatarBytes(bytes)!;
    expect(shrunk.length).toBeLessThan(bytes.length);
    expect(shrunk[0]).toBe(0xff);
  });

  test("refuses photos too big to decode in an action's memory before decoding them", () => {
    expect(() => shrinkAvatarBytes(withSegments(tiny, frameSegment(5712, 4284)))).toThrow(
      "5712x4284 JPEG is too large to decode in an action"
    );
    expect(() =>
      shrinkAvatarBytes(withSegments(tiny, frameSegment(3000, 2000, [0x11, 0x11, 0x11])))
    ).toThrow("too large");
    expect(() => shrinkAvatarBytes(pngHeader(4000, 3000))).toThrow(
      "4000x3000 PNG is too large to decode in an action"
    );
  });

  test("tries photos within the limit, and refuses a JPEG whose size can't be read", () => {
    expect(() => shrinkAvatarBytes(withSegments(tiny, frameSegment(3600, 2900)))).not.toThrow(
      "too large"
    );
    expect(() => shrinkAvatarBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xda]))).toThrow(
      "Couldn't find the JPEG's size"
    );
  });

  test("leaves other formats and files that wouldn't get smaller", () => {
    expect(shrinkAvatarBytes(new TextEncoder().encode("GIF89a not a photo"))).toBeNull();
    expect(shrinkAvatarBytes(tiny)).toBeNull();
  });
});

const signedIn = (t: TestConvex<typeof schema>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|s`, issuer: "test" });

async function userWithUpload(bytes: Uint8Array, type = "image/jpeg") {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) =>
    ctx.db.insert("users", { email: "ivy@sow.org.au", name: "Ivy" })
  );
  const storageId = await t.run((ctx) =>
    ctx.storage.store(new Blob([bytes as BlobPart], { type }))
  );
  return { t, userId, storageId };
}

const avatarOf = (t: TestConvex<typeof schema>, userId: Id<"users">) =>
  t.run(async (ctx) => {
    const user = await ctx.db.get("users", userId);
    const file = user?.avatarId ? await ctx.db.system.get(user.avatarId) : null;
    return { avatarId: user?.avatarId ?? null, size: file?.size ?? null };
  });

describe("avatar shrinking", () => {
  test("a large upload is swapped for a small copy and the original is deleted", async () => {
    vi.useFakeTimers();
    const original = bigJpeg();
    const { t, userId, storageId } = await userWithUpload(original);
    await signedIn(t, userId).mutation(api.profile.setAvatar, { storageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const after = await avatarOf(t, userId);
    expect(after.avatarId).not.toBe(storageId);
    expect(after.size).toBeLessThan(original.length / 4);
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).toBeNull();
  });

  test("a small upload is kept as it is", async () => {
    vi.useFakeTimers();
    const { t, userId, storageId } = await userWithUpload(tiny);
    await signedIn(t, userId).mutation(api.profile.setAvatar, { storageId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await avatarOf(t, userId)).avatarId).toBe(storageId);
  });

  test("the small copy is thrown away if the avatar changed in the meantime", async () => {
    const { t, userId, storageId } = await userWithUpload(bigJpeg());
    const copy = await t.run((ctx) => ctx.storage.store(new Blob(["copy"])));
    await t.mutation(internal.profile.replaceAvatar, { userId, from: storageId, to: copy });
    expect((await avatarOf(t, userId)).avatarId).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(copy))).toBeNull();
    expect(await t.run((ctx) => ctx.storage.getUrl(storageId))).not.toBeNull();
  });

  test("a file that can't be read or decoded is left alone", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const broken = new Uint8Array(200_000).fill(7);
    broken.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x02]);
    const { t, userId, storageId } = await userWithUpload(broken);
    await t.run((ctx) => ctx.db.patch("users", userId, { avatarId: storageId }));
    await t.action(internal.avatars.shrink, { userId, storageId });
    expect((await avatarOf(t, userId)).avatarId).toBe(storageId);
    expect(warn).toHaveBeenCalled();

    const gif = new Uint8Array(200_000).fill(1);
    const other = await userWithUpload(gif, "image/gif");
    await other.t.action(internal.avatars.shrink, {
      userId: other.userId,
      storageId: other.storageId,
    });
    await other.t.run((ctx) => ctx.storage.delete(other.storageId));
    await other.t.action(internal.avatars.shrink, {
      userId: other.userId,
      storageId: other.storageId,
    });
  });

  test("a photo too big to decode is left alone with a warning instead of running out of memory", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const huge = new Uint8Array(200_000);
    huge.set(withSegments(tiny, frameSegment(5712, 4284)));
    const { t, userId, storageId } = await userWithUpload(huge);
    await t.run((ctx) => ctx.db.patch("users", userId, { avatarId: storageId }));
    await t.action(internal.avatars.shrink, { userId, storageId });
    expect((await avatarOf(t, userId)).avatarId).toBe(storageId);
    expect(warn).toHaveBeenCalledWith(
      `Couldn't shrink avatar ${storageId}`,
      expect.objectContaining({ message: "5712x4284 JPEG is too large to decode in an action" })
    );
  });

  test("shrinkAll queues only the avatars that are too big", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const big = await ctx.storage.store(new Blob([bigJpeg() as BlobPart]));
      const small = await ctx.storage.store(new Blob([tiny as BlobPart]));
      const gone = await ctx.storage.store(new Blob([bigJpeg() as BlobPart]));
      await ctx.storage.delete(gone);
      return {
        bigUser: await ctx.db.insert("users", { email: "a@sow.org.au", avatarId: big }),
        smallUser: await ctx.db.insert("users", { email: "b@sow.org.au", avatarId: small }),
        goneUser: await ctx.db.insert("users", { email: "c@sow.org.au", avatarId: gone }),
        noAvatar: await ctx.db.insert("users", { email: "d@sow.org.au" }),
        big,
        small,
      };
    });
    expect(await t.action(internal.avatars.shrinkAll, {})).toBe(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await avatarOf(t, ids.bigUser)).avatarId).not.toBe(ids.big);
    expect((await avatarOf(t, ids.smallUser)).avatarId).toBe(ids.small);
  });
});
