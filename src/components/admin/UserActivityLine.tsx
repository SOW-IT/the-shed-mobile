import { api } from "@convex/_generated/api";
import { compareVersions } from "@shared/appLinks";
import { timeAgo } from "@shared/datetime";
import type { FunctionReturnType } from "convex/server";
import { Fragment } from "react";
import { Text } from "react-native";
import { typography, useAppTheme } from "@/theme";

type UserActivity = NonNullable<FunctionReturnType<typeof api.admin.userActivity>>[number];
type AppPlatform = UserActivity["versions"][number]["platform"];

type Segment = { key: string; text: string; spoken: string; behind: boolean };

const PLATFORM_LABEL: Record<AppPlatform, string> = { ios: "iOS", android: "Android" };

export const newestVersions = (rows: readonly UserActivity[]): ReadonlyMap<AppPlatform, string> => {
  const newest = new Map<AppPlatform, string>();
  for (const row of rows) {
    for (const { platform, version } of row.versions) {
      const known = newest.get(platform);
      if (!known || compareVersions(version, known) > 0) newest.set(platform, version);
    }
  }
  return newest;
};

export const UserActivityLine = ({
  activity,
  newest,
}: {
  activity: UserActivity | undefined;
  newest: ReadonlyMap<AppPlatform, string>;
}) => {
  const t = useAppTheme();
  if (!activity) return null;
  const segments: Segment[] = activity.versions.map(({ platform, version }) => {
    const latest = newest.get(platform);
    const behind = latest !== undefined && compareVersions(version, latest) < 0;
    return {
      key: platform,
      text: `${PLATFORM_LABEL[platform]} ${version}`,
      spoken: `${PLATFORM_LABEL[platform]} ${version}${behind ? `, behind ${latest}` : ""}`,
      behind,
    };
  });
  if (activity.lastSeenAt !== null) {
    const online = `Online ${timeAgo(activity.lastSeenAt)}`;
    segments.push({ key: "online", text: online, spoken: online, behind: false });
  }
  if (segments.length === 0) return null;
  return (
    <Text
      accessibilityLabel={segments.map((segment) => segment.spoken).join(", ")}
      style={[typography.caption, { color: t.muted }]}
    >
      {segments.map((segment, index) => (
        <Fragment key={segment.key}>
          {index > 0 ? " · " : ""}
          <Text style={segment.behind ? { color: t.warning, fontWeight: "700" } : undefined}>
            {segment.text}
          </Text>
        </Fragment>
      ))}
    </Text>
  );
};
