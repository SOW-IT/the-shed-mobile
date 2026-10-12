import { AdvancedMarker, APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Id } from "../../convex/_generated/dataModel";
import { churchAcronym } from "../../shared/churches";
import { radius, useAppTheme } from "../theme";
import type { Church } from "./ChurchPicker";

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

export const churchMapAvailable = API_KEY.length > 0;

const SYDNEY = { lat: -33.8, lng: 151.05 };
const SINGLE_CHURCH_ZOOM = 14;

type Placed = { church: Church; position: { lat: number; lng: number } };

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
  churches,
  selectedId,
  onSelect,
}: {
  churches: readonly Church[];
  selectedId: Id<"churches"> | null;
  onSelect: (churchId: Id<"churches">) => void;
}) {
  const t = useAppTheme();
  const placed: Placed[] = churches.flatMap((church) =>
    church.location ? [{ church, position: church.location }] : []
  );
  const placedKey = JSON.stringify(placed.map(({ position }) => position));

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
          {placed.map(({ church, position }) => {
            const on = church._id === selectedId;
            return (
              <AdvancedMarker
                key={church._id}
                position={position}
                title={church.name}
                zIndex={on ? 2 : 1}
                onClick={() => onSelect(church._id)}
              >
                <div
                  role="button"
                  aria-label={`${church.name}. Show who goes there`}
                  data-church-pin={church.name}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}
                >
                  <div
                    style={{
                      maxWidth: 120,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      padding: "4px 10px",
                      borderRadius: 999,
                      border: `1px solid ${t.primary}`,
                      background: on ? t.primary : t.card,
                      color: on ? t.onPrimary : t.text,
                      font: "700 12px/1.3 system-ui, -apple-system, sans-serif",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.25)",
                    }}
                  >
                    {churchAcronym(church.name)}
                  </div>
                  <div
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: "6px solid transparent",
                      borderRight: "6px solid transparent",
                      borderTop: `8px solid ${t.primary}`,
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
