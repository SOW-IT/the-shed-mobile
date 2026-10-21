import { useQuery } from "convex/react";
import Constants from "expo-constants";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { Linking, Platform, View } from "react-native";
import { api } from "@convex/_generated/api";
import { appLinkForScheme, WEB_ONLY_MARKER } from "@shared/appLinks";
import { Btn, EmptyState, LoadingState, ReadableColumn, Screen } from "@/components/ui";
import { appVersion } from "@/hooks/useReportAppVersion";
import { spacing } from "@/theme";

/**
 * A link this version of the app has no page for. In the app that's usually
 * a page added in a newer version, so it offers the web (which always has the
 * latest pages) and the store. "#noapp" stops the web handing the page
 * straight back to this app.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const link = appLinkForScheme(Constants.expoConfig?.scheme as string | undefined);
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;
  const version = appVersion();
  const store = platform === "ios" ? link.iosStore : platform === "android" ? link.androidStore : null;
  const check = useQuery(
    api.appInstalls.updateStatus,
    platform && version ? { platform, version } : "skip"
  );
  // The router adds the unmatched path itself as "not-found"; it isn't part of the link.
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      v === undefined || k === "not-found"
        ? []
        : (Array.isArray(v) ? v : [v]).map((x) => [k, String(x)])
    )
  ).toString();
  const webUrl = `${link.web}${pathname}${query ? `?${query}` : ""}${WEB_ONLY_MARKER}`;
  const goHome = () => router.replace("/home");

  if (platform && version && check === undefined) {
    return (
      <Screen title="Page not found" onBack={goHome}>
        <LoadingState />
      </Screen>
    );
  }

  const latest = check?.latest ?? null;
  const outOfDate = !!check && check.status !== "ok" && !!latest && !!store;

  return (
    <Screen title="Page not found" onBack={goHome}>
      <ReadableColumn>
        <EmptyState
          icon="compass-outline"
          title={outOfDate ? "This page may need a newer THE SHED" : "There's nothing here"}
          message={
            outOfDate
              ? "Open it on the web for now, or update the app."
              : "This link doesn't lead anywhere. It may be wrong, or the page may have moved."
          }
        />
        <View style={{ gap: spacing.sm, alignItems: "center" }}>
          {outOfDate ? (
            <>
              <Btn
                title="Open on the web"
                icon="open-outline"
                onPress={() => void Linking.openURL(webUrl).catch(() => {})}
              />
              <Btn
                title={`Update ${version} → ${latest}`}
                variant="tonal"
                icon="download-outline"
                onPress={() => {
                  if (store) void Linking.openURL(store).catch(() => {});
                }}
              />
            </>
          ) : null}
          <Btn title="Go home" variant={outOfDate ? "ghost" : "primary"} onPress={goHome} />
        </View>
      </ReadableColumn>
    </Screen>
  );
}
