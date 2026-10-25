import { beforeEach, describe, expect, test, vi } from "vitest";
import { PHOTO_UPLOAD_MAX_EDGE, shrinkPhotoForUpload } from "./shrinkPhotoForUpload";

const mocks = vi.hoisted(() => ({ manipulate: vi.fn(), saveAsync: vi.fn() }));

vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: mocks.manipulate },
  SaveFormat: { JPEG: "jpeg", PNG: "png" },
}));

beforeEach(() => {
  mocks.manipulate.mockReset();
  mocks.saveAsync.mockReset();
  mocks.manipulate.mockReturnValue({ renderAsync: async () => ({ saveAsync: mocks.saveAsync }) });
});

describe("shrinkPhotoForUpload", () => {
  test("decodes no larger than the upload edge and saves a JPEG", async () => {
    mocks.saveAsync.mockResolvedValue({ uri: "file:///small.jpg" });
    expect(await shrinkPhotoForUpload("file:///big.heic", "image/heic")).toEqual({
      uri: "file:///small.jpg",
      mimeType: "image/jpeg",
    });
    expect(mocks.manipulate).toHaveBeenCalledWith("file:///big.heic", {
      maxWidth: PHOTO_UPLOAD_MAX_EDGE,
      maxHeight: PHOTO_UPLOAD_MAX_EDGE,
    });
    expect(mocks.saveAsync).toHaveBeenCalledWith({ compress: 0.8, format: "jpeg" });
  });

  test("keeps a PNG as a PNG so see-through areas survive until the server puts them on white", async () => {
    mocks.saveAsync.mockResolvedValue({ uri: "file:///small.png" });
    expect(await shrinkPhotoForUpload("file:///logo.png", "image/png")).toEqual({
      uri: "file:///small.png",
      mimeType: "image/png",
    });
    expect(mocks.saveAsync).toHaveBeenCalledWith({ format: "png" });
  });

  test("saves a JPEG when the picker gives no type", async () => {
    mocks.saveAsync.mockResolvedValue({ uri: "file:///small.jpg" });
    expect((await shrinkPhotoForUpload("file:///photo")).mimeType).toBe("image/jpeg");
  });
});
