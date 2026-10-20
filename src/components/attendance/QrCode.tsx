import { create } from "qrcode/lib/core/qrcode";
import { useMemo } from "react";
import { View } from "react-native";

const QUIET_ZONE = 4;

const darkRuns = (row: Uint8Array): [number, number][] => {
  const runs: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= row.length; x++) {
    const dark = x < row.length && row[x] === 1;
    if (dark && start === -1) start = x;
    if (!dark && start !== -1) {
      runs.push([start, x - start]);
      start = -1;
    }
  }
  return runs;
};

export function QrCode({ value, size }: { value: string; size: number }) {
  const matrix = useMemo(() => {
    const { modules } = create(value, { errorCorrectionLevel: "M" });
    const rows: Uint8Array[] = [];
    for (let y = 0; y < modules.size; y++) {
      rows.push(modules.data.subarray(y * modules.size, (y + 1) * modules.size));
    }
    return { count: modules.size, runs: rows.map(darkRuns) };
  }, [value]);
  const cell = size / (matrix.count + QUIET_ZONE * 2);
  const offset = cell * QUIET_ZONE;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="QR code for the check-in page"
      style={{ width: size, height: size, backgroundColor: "#ffffff" }}
    >
      {matrix.runs.flatMap((runs, y) =>
        runs.map(([x, length]) => (
          <View
            key={`${y}-${x}`}
            style={{
              position: "absolute",
              left: offset + x * cell,
              top: offset + y * cell,
              width: length * cell + 0.5,
              height: cell + 0.5,
              backgroundColor: "#000000",
            }}
          />
        ))
      )}
    </View>
  );
}
