import { Paths, File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/**
 * Downloads (web) or shares (native) the CSV text under `filename`.
 * - Web: triggers a browser download via a temporary object-URL anchor.
 * - Native: writes to the cache directory and opens the system share sheet.
 */
export const downloadCsv = async (
  filename: string,
  csv: string,
  dialogTitle = "Export"
): Promise<void> => {
  if (Platform.OS === "web") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
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
  file.write(csv);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: "text/csv",
      UTI: "public.comma-separated-values-text",
      dialogTitle,
    });
  }
};
