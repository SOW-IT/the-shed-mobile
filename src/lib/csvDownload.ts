import { Paths, File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Saves a file the app made: a download in the browser, the share sheet on a
 * phone (Save to Files, AirDrop, Mail…).
 */
export const downloadFile = async (
  filename: string,
  data: string | Uint8Array,
  opts: { mimeType: string; uti: string; dialogTitle: string }
): Promise<void> => {
  if (Platform.OS === "web") {
    const blob = new Blob([data as BlobPart], { type: opts.mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(data);
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: opts.mimeType,
        UTI: opts.uti,
        dialogTitle: opts.dialogTitle,
      });
    }
  } finally {
    if (file.exists) file.delete();
  }
};

export const downloadCsv = (
  filename: string,
  csv: string,
  dialogTitle = "Export"
): Promise<void> =>
  downloadFile(filename, csv, {
    mimeType: "text/csv;charset=utf-8;",
    uti: "public.comma-separated-values-text",
    dialogTitle,
  });
