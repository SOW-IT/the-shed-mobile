import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const PHOTO_UPLOAD_MAX_EDGE = 512;
const PHOTO_UPLOAD_JPEG_QUALITY = 0.8;

const keepsTransparency = (mimeType: string | null | undefined) => mimeType === "image/png";

export async function shrinkPhotoForUpload(uri: string, mimeType?: string | null) {
  const image = await ImageManipulator.manipulate(uri, {
    maxWidth: PHOTO_UPLOAD_MAX_EDGE,
    maxHeight: PHOTO_UPLOAD_MAX_EDGE,
  }).renderAsync();
  const png = keepsTransparency(mimeType);
  const saved = await image.saveAsync(
    png ? { format: SaveFormat.PNG } : { compress: PHOTO_UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG }
  );
  return { uri: saved.uri, mimeType: png ? "image/png" : "image/jpeg" };
}
