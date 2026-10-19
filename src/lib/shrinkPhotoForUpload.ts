import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export const PHOTO_UPLOAD_MAX_EDGE = 512;
const PHOTO_UPLOAD_JPEG_QUALITY = 0.8;

export async function shrinkPhotoForUpload(uri: string) {
  const image = await ImageManipulator.manipulate(uri, {
    maxWidth: PHOTO_UPLOAD_MAX_EDGE,
    maxHeight: PHOTO_UPLOAD_MAX_EDGE,
  }).renderAsync();
  const saved = await image.saveAsync({
    compress: PHOTO_UPLOAD_JPEG_QUALITY,
    format: SaveFormat.JPEG,
  });
  return { uri: saved.uri, mimeType: "image/jpeg" };
}
