import { Image, StyleSheet, Text, View } from "react-native";
import { subgroupColour, subgroupLabel, contrastingText } from "../../shared/rollcall";
import { subgroupLogo, universityLogo } from "@/lib/universityLogos";
import { radius, typography, useAppTheme } from "@/theme";

const SIZES = {
  sm: { logoHeight: 18, badgePadH: 8, badgePadV: 3, fontSize: 11 },
  md: { logoHeight: 24, badgePadH: 10, badgePadV: 4, fontSize: 12 },
  lg: { logoHeight: 32, badgePadH: 12, badgePadV: 5, fontSize: 13 },
  xl: { logoHeight: 40, badgePadH: 14, badgePadV: 6, fontSize: 14 },
} as const;

export type CampusMarkSize = keyof typeof SIZES;

type CampusMarkProps = {
  /** Full campus name, acronym, or the attendance sub-group id (incl. "ALL"). */
  campus: string;
  size?: CampusMarkSize;
  /** When set, pick the logo source explicitly (defaults to sub-group lookup). */
  logoSource?: "subgroup" | "university";
  /** Circular avatar-style mark for compact pickers (tight to the logo/badge). */
  variant?: "default" | "circle";
  /** Diameter when `variant="circle"`. */
  circleDiameter?: number;
};

/**
 * Campus branding for org chart and Attendance: a coloured wordmark when we
 * have one, otherwise a solid badge in the campus colour with its acronym.
 */
export function CampusMark({
  campus,
  size = "md",
  logoSource = "subgroup",
  variant = "default",
  circleDiameter = 40,
}: CampusMarkProps) {
  const t = useAppTheme();
  const colour = subgroupColour(campus);
  const label = subgroupLabel(campus);
  const logo =
    logoSource === "university"
      ? universityLogo(campus)
      : subgroupLogo(campus, t.dark);
  const dims = SIZES[size];
  const r = circleDiameter / 2;

  if (variant === "circle") {
    if (logo) {
      return (
        <View
          style={[
            styles.circle,
            {
              width: circleDiameter,
              height: circleDiameter,
              borderRadius: r,
            },
          ]}
        >
          <Image
            source={logo}
            style={{ width: circleDiameter - 6, height: circleDiameter - 6 }}
            resizeMode="contain"
          />
        </View>
      );
    }
    const fontSize = label.length > 4 ? 9 : label.length > 3 ? 10 : 11;
    return (
      <View
        style={[
          styles.circle,
          {
            width: circleDiameter,
            height: circleDiameter,
            borderRadius: r,
            backgroundColor: colour,
          },
        ]}
      >
        <Text
          style={[
            styles.badgeText,
            { color: contrastingText(colour), fontSize, textAlign: "center" },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {label}
        </Text>
      </View>
    );
  }

  if (logo) {
    return (
      <Image
        source={logo}
        style={{ height: dims.logoHeight, width: dims.logoHeight * 4, maxWidth: size === "xl" ? 168 : 140 }}
        resizeMode="contain"
      />
    );
  }

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colour,
          paddingHorizontal: dims.badgePadH,
          paddingVertical: dims.badgePadV,
        },
      ]}
    >
      <Text
        style={[
          typography.caption,
          styles.badgeText,
          { color: contrastingText(colour), fontSize: dims.fontSize },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: radius.full,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});
