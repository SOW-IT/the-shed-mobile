import { FURNITURE, type FurnitureId, type WallpaperId } from "@shared/home";
import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { closeCamera } from "./camera";
import { drawFurniture, WALLPAPER_LOOKS } from "./furniture";
import { Builder } from "./gardenScene";
import { Shape } from "./Shapes";

export const FurnitureThumb = memo(function FurnitureThumb({ item, size }: { item: FurnitureId; size: number }) {
  const prims = useMemo(() => {
    const { w, d } = FURNITURE[item];
    const cam = closeCamera(size, size, Math.max(w, d, 1.1));
    const b = new Builder(cam, `thumb-${item}`);
    drawFurniture(b, item, 0, 0, 0);
    return b.take();
  }, [item, size]);
  return (
    <View pointerEvents="none" style={{ width: size, height: size, overflow: "hidden" }}>
      {prims.map((prim) => (
        <Shape key={prim.key} prim={prim} />
      ))}
    </View>
  );
});

export const WallpaperSwatch = ({ id, size }: { id: WallpaperId; size: number }) => {
  const look = WALLPAPER_LOOKS[id];
  const unit = size / 6;
  const marks: { key: string; style: object }[] = [];
  if (look.pattern === "stripes") {
    for (let i = 0; i < 3; i++) marks.push({ key: `s${i}`, style: { left: unit * (0.5 + i * 2), top: 0, width: unit, height: size } });
  } else if (look.pattern === "check") {
    for (let i = 0; i < 3; i++) {
      marks.push({ key: `v${i}`, style: { left: unit * (0.5 + i * 2), top: 0, width: unit * 0.6, height: size, opacity: 0.6 } });
      marks.push({ key: `h${i}`, style: { top: unit * (0.5 + i * 2), left: 0, height: unit * 0.6, width: size, opacity: 0.6 } });
    }
  } else if (look.pattern === "dots" || look.pattern === "stars") {
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const dot = look.pattern === "stars" ? unit * (0.35 + ((r + c) % 2) * 0.2) : unit * 0.7;
        marks.push({
          key: `d${r}${c}`,
          style: { left: unit * (1 + c * 2) - dot / 2 + (r % 2) * unit * 0.6, top: unit * (1 + r * 2) - dot / 2, width: dot, height: dot, borderRadius: dot },
        });
      }
    }
  }
  return (
    <View pointerEvents="none" style={[styles.swatch, { width: size, height: size, backgroundColor: look.base }]}>
      {marks.map((m) => (
        <View key={m.key} style={[styles.mark, { backgroundColor: look.accent }, m.style]} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  swatch: { overflow: "hidden", borderRadius: 10 },
  mark: { position: "absolute" },
});
