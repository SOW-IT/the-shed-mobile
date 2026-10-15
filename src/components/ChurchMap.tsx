import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Id } from "../../convex/_generated/dataModel";
import { radius, useAppTheme } from "../theme";
import {
  PIN_NAME_MAX_WIDTH,
  pinAccessibilityLabel,
  pinRing,
  pinLabel,
  pinSize,
  pinZIndex,
  type ChurchPin,
} from "./churchPins";

export type { ChurchPin } from "./churchPins";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export const churchMapAvailable = API_KEY.length > 0;

const SYDNEY = { lat: -33.8, lng: 151.05 };
const SINGLE_CHURCH_ZOOM = 14;

type Placed = { pin: ChurchPin; position: { lat: number; lng: number } };

function FitToChurches({ placedKey }: { placedKey: string }) {
  const map = useMap();
  const core = useMapsLibrary("core");
  useEffect(() => {
    if (!map || !core) return;
    const positions: { lat: number; lng: number }[] = JSON.parse(placedKey);
    if (positions.length === 1) {
      map.setCenter(positions[0]);
      map.setZoom(SINGLE_CHURCH_ZOOM);
    } else if (positions.length > 1) {
      const bounds = new core.LatLngBounds();
      for (const position of positions) bounds.extend(position);
      map.fitBounds(bounds, { top: 56, right: 40, bottom: 24, left: 40 });
    }
  }, [map, core, placedKey]);
  return null;
}

export function ChurchMap({
  pins,
  selectedId,
  onSelect,
}: {
  pins: readonly ChurchPin[];
  selectedId: Id<"churches"> | null;
  onSelect: (churchId: Id<"churches">) => void;
}) {
  const t = useAppTheme();
  const placed: Placed[] = pins.flatMap((pin) =>
    pin.church.location ? [{ pin, position: pin.church.location }] : []
  );
  const placedKey = JSON.stringify(placed.map(({ position }) => position));
  const most = Math.max(0, ...pins.map((pin) => pin.people));

  return (
    <View style={styles.map}>
      <APIProvider apiKey={API_KEY}>
        <Map
          mapId={MAP_ID}
          defaultCenter={SYDNEY}
          defaultZoom={10}
          gestureHandling="cooperative"
          disableDefaultUI
          zoomControl
          clickableIcons={false}
          colorScheme={t.dark ? "DARK" : "LIGHT"}
          style={{ width: "100%", height: "100%" }}
        >
          {placed.map(({ pin, position }) => {
            const on = pin.church._id === selectedId;
            const ring = pinRing(pin, t.primary);
            const size = pinSize(pin.people, most);
            return (
              <AdvancedMarker
                key={pin.church._id}
                position={position}
                title={pin.church.name}
                zIndex={pinZIndex(pin, on)}
                onClick={() => onSelect(pin.church._id)}
              >
                <div
                  role="button"
                  aria-label={pinAccessibilityLabel(pin)}
                  data-church-pin={pin.church.name}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      maxWidth: PIN_NAME_MAX_WIDTH,
                      height: size.height,
                      boxSizing: "border-box",
                      padding: `0 ${size.paddingHorizontal}px`,
                      borderRadius: 999,
                      border: `1.5px solid ${on ? t.primary : ring}`,
                      background: on ? t.primary : t.card,
                      color: on ? t.onPrimary : t.text,
                      font: `700 ${size.fontSize}px/1 system-ui, -apple-system, sans-serif`,
                      letterSpacing: 0.2,
                      boxShadow: "0 1px 4px rgba(0, 0, 0, 0.3)",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pinLabel(pin, on)}
                    </span>
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      marginTop: -1,
                      borderLeft: "5px solid transparent",
                      borderRight: "5px solid transparent",
                      borderTop: `6px solid ${on ? t.primary : ring}`,
                    }}
                  />
                </div>
              </AdvancedMarker>
            );
          })}
          <FitToChurches placedKey={placedKey} />
        </Map>
      </APIProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 320, borderRadius: radius.md, overflow: "hidden" },
});
