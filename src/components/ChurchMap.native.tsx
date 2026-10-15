import Constants from "expo-constants";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { Id } from "../../convex/_generated/dataModel";
import { radius, useAppTheme } from "../theme";
import {
  PIN_NAME_MAX_WIDTH,
  pinAccessibilityLabel,
  pinColours,
  pinLabel,
  pinZIndex,
  type ChurchPin,
} from "./churchPins";

export type { ChurchPin } from "./churchPins";

type GoogleMapsBuild = { ios?: boolean; android?: boolean };

const googleMapsBuild = (Constants.expoConfig?.extra?.googleMaps ?? {}) as GoogleMapsBuild;
const usesGoogle = Platform.OS === "android" ? googleMapsBuild.android === true : googleMapsBuild.ios === true;

export const churchMapAvailable = Platform.OS === "ios" || usesGoogle;

type Coordinate = { latitude: number; longitude: number };

const SYDNEY = { latitude: -33.8, longitude: 151.05, latitudeDelta: 0.4, longitudeDelta: 0.4 };
const MIN_DELTA = 0.03;
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
  pins,
  selectedId,
  onSelect,
}: {
  pins: readonly ChurchPin[];
  selectedId: Id<"churches"> | null;
  onSelect: (churchId: Id<"churches">) => void;
}) {
  const t = useAppTheme();
  const map = useRef<MapView>(null);
  const placed = pins.flatMap((pin) =>
    pin.church.location
      ? [{ pin, coordinate: { latitude: pin.church.location.lat, longitude: pin.church.location.lng } }]
      : []
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
      mapType={usesGoogle ? "standard" : "mutedStandard"}
      style={styles.map}
      initialRegion={initialRegion}
      showsPointsOfInterests={false}
      toolbarEnabled={false}
    >
      {placed.map(({ pin, coordinate }) => {
        const on = pin.church._id === selectedId;
        const { ring, badgeText } = pinColours(pin, t.primary);
        return (
          <Marker
            key={`${pin.church._id}:${on ? "on" : "off"}:${pin.people}:${ring}`}
            coordinate={coordinate}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={pinZIndex(pin, on)}
            accessibilityLabel={pinAccessibilityLabel(pin)}
            onPress={() => onSelect(pin.church._id)}
          >
            <View style={styles.pin}>
              <View
                style={[
                  styles.bubble,
                  {
                    backgroundColor: on ? t.primary : t.card,
                    borderColor: on ? t.primary : ring,
                    paddingLeft: pin.people > 0 ? 3 : 10,
                  },
                ]}
              >
                {pin.people > 0 ? (
                  <View style={[styles.badge, { backgroundColor: on ? t.onPrimary : ring }]}>
                    <Text style={[styles.badgeText, { color: on ? t.primary : badgeText }]}>{pin.people}</Text>
                  </View>
                ) : null}
                <Text
                  style={[styles.labelText, { color: on ? t.onPrimary : t.text }]}
                  numberOfLines={1}
                >
                  {pinLabel(pin, on)}
                </Text>
              </View>
              <View style={[styles.stem, { borderTopColor: on ? t.primary : ring }]} />
            </View>
          </Marker>
        );
      })}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: radius.md },
  pin: { alignItems: "center", padding: 4 },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: PIN_NAME_MAX_WIDTH,
    height: 26,
    paddingRight: 10,
    borderRadius: radius.full,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10.5, fontWeight: "800" },
  labelText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2, flexShrink: 1 },
  stem: {
    width: 0,
    height: 0,
    marginTop: -1,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: 6,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
