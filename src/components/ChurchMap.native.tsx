import Constants from "expo-constants";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Id } from "../../convex/_generated/dataModel";
import { churchAcronym } from "../../shared/churches";
import { radius, spacing, typography, useAppTheme } from "../theme";
import type { Church } from "./ChurchPicker";

type GoogleMapsBuild = { ios?: boolean; android?: boolean };

const googleMapsBuild = (Constants.expoConfig?.extra?.googleMaps ?? {}) as GoogleMapsBuild;
const usesGoogle = Platform.OS === "android" ? googleMapsBuild.android === true : googleMapsBuild.ios === true;

export const churchMapAvailable = Platform.OS === "ios" || usesGoogle;

type Coordinate = { latitude: number; longitude: number };

const SYDNEY = { latitude: -33.8, longitude: 151.05, latitudeDelta: 0.4, longitudeDelta: 0.4 };
const MIN_DELTA = 0.03;
const LABEL_MAX_WIDTH = 120;
const LATITUDE_ROOM = 1.5;
const LONGITUDE_ROOM = 1.6;
const LABEL_LIFT = 0.08;

const regionFor = (placedKey: string) => {
  const coordinates: Coordinate[] = JSON.parse(placedKey);
  if (coordinates.length === 0) return SYDNEY;
  const latitudes = coordinates.map((c) => c.latitude);
  const longitudes = coordinates.map((c) => c.longitude);
  const [south, north] = [Math.min(...latitudes), Math.max(...latitudes)];
  const [west, east] = [Math.min(...longitudes), Math.max(...longitudes)];
  const latitudeDelta = Math.max((north - south) * LATITUDE_ROOM, MIN_DELTA);
  const longitudeDelta = Math.max((east - west) * LONGITUDE_ROOM, MIN_DELTA);
  return {
    latitude: (north + south) / 2 + latitudeDelta * LABEL_LIFT,
    longitude: (east + west) / 2,
    latitudeDelta,
    longitudeDelta,
  };
};

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
  const map = useRef<MapView>(null);
  const placed = churches.flatMap((church) =>
    church.location ? [{ church, coordinate: { latitude: church.location.lat, longitude: church.location.lng } }] : []
  );
  const placedKey = JSON.stringify(placed.map(({ coordinate }) => coordinate));

  const [initialRegion] = useState(() => regionFor(placedKey));
  const shownKey = useRef(placedKey);

  useEffect(() => {
    if (shownKey.current === placedKey) return;
    shownKey.current = placedKey;
    map.current?.animateToRegion(regionFor(placedKey), 250);
  }, [placedKey]);

  return (
    <MapView
      ref={map}
      provider={usesGoogle ? PROVIDER_GOOGLE : undefined}
      style={styles.map}
      initialRegion={initialRegion}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
    >
      {placed.map(({ church, coordinate }) => {
        const on = church._id === selectedId;
        return (
          <Marker
            key={church._id}
            coordinate={coordinate}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={on ? 2 : 1}
            accessibilityLabel={`${church.name}. Show who goes there`}
            onPress={() => onSelect(church._id)}
          >
            <View style={styles.pin}>
              <View
                style={[
                  styles.label,
                  t.shadowFloat,
                  { backgroundColor: on ? t.primary : t.card, borderColor: t.primary },
                ]}
              >
                <Text
                  style={[typography.caption, styles.labelText, { color: on ? t.onPrimary : t.text }]}
                  numberOfLines={1}
                >
                  {churchAcronym(church.name)}
                </Text>
              </View>
              <View style={[styles.stem, { borderTopColor: t.primary }]} />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: radius.md },
  pin: { alignItems: "center" },
  label: {
    maxWidth: LABEL_MAX_WIDTH,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  labelText: { fontWeight: "700" },
  stem: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
