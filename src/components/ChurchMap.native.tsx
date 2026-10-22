import Constants from "expo-constants";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
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

type GoogleMapsBuild = { android?: boolean };

const googleMapsBuild = (Constants.expoConfig?.extra?.googleMaps ?? {}) as GoogleMapsBuild;
const usesGoogle = Platform.OS === "android" && googleMapsBuild.android === true;

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
  const most = Math.max(0, ...pins.map((pin) => pin.people));

  const [initialRegion] = useState(() => regionFor(placedKey));
  const shownKey = useRef(placedKey);

  useEffect(() => {
    if (shownKey.current === placedKey) return;
    shownKey.current = placedKey;
    map.current?.animateToRegion(regionFor(placedKey), 250);
  }, [placedKey]);

  return (
    // MapView ignores its own borderRadius on iOS, so a wrapper clips the corners.
    <View style={[styles.frame, t.surfaceEdge]}>
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
          const ring = pinRing(pin, t.primary);
          const size = pinSize(pin.people, most);
          const label = pinLabel(pin, on);
          return (
            <ChurchMarker
              key={`${pin.church._id}:${on ? "on" : "off"}:${label}:${size.fontSize}:${size.height}:${size.paddingHorizontal}:${ring}:${t.dark ? "dark" : "light"}`}
              pin={pin}
              coordinate={coordinate}
              on={on}
              label={label}
              ring={ring}
              size={size}
              onSelect={onSelect}
            />
          );
        })}
      </MapView>
    </View>
  );
}

const PIN_DRAW_MS = 500;
const PIN_PADDING = 4;
const STEM_HEIGHT = 6;
const STEM_OVERLAP = 1;

const pinHeight = (bubbleHeight: number) => PIN_PADDING * 2 + bubbleHeight + STEM_HEIGHT - STEM_OVERLAP;

function ChurchMarker({
  pin,
  coordinate,
  on,
  label,
  ring,
  size,
  onSelect,
}: {
  pin: ChurchPin;
  coordinate: Coordinate;
  on: boolean;
  label: string;
  ring: string;
  size: ReturnType<typeof pinSize>;
  onSelect: (churchId: Id<"churches">) => void;
}) {
  const t = useAppTheme();
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDrawn(true), PIN_DRAW_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Marker
      coordinate={coordinate}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -pinHeight(size.height) / 2 }}
      zIndex={pinZIndex(pin, on)}
      tracksViewChanges={!drawn}
      accessibilityLabel={pinAccessibilityLabel(pin)}
      onPress={() => onSelect(pin.church._id)}
    >
      <View style={styles.pin}>
        <View
          style={[
            styles.bubble,
            {
              height: size.height,
              paddingHorizontal: size.paddingHorizontal,
              backgroundColor: on ? t.primary : t.card,
              borderColor: on ? t.primary : ring,
            },
          ]}
        >
          <Text
            style={[styles.labelText, { fontSize: size.fontSize, color: on ? t.onPrimary : t.text }]}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
        <View style={[styles.stem, { borderTopColor: on ? t.primary : ring }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.lg, overflow: "hidden" },
  map: { height: 300 },
  pin: { alignItems: "center", padding: PIN_PADDING },
  bubble: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: PIN_NAME_MAX_WIDTH,
    borderRadius: radius.full,
    borderWidth: 1.5,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  labelText: { fontWeight: "700", letterSpacing: 0.2, flexShrink: 1 },
  stem: {
    width: 0,
    height: 0,
    marginTop: -STEM_OVERLAP,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderTopWidth: STEM_HEIGHT,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
});
