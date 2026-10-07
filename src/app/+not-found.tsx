import Constants from "expo-constants";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { Linking, Platform, View } from "react-native";
import { appLinkForScheme } from "@shared/appLinks";
import { Btn, EmptyState, ReadableColumn, Screen } from "@/components/ui";
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
  const native = Platform.OS !== "web";
  const store = Platform.OS === "ios" ? link.iosStore : link.androidStore;
  // The router adds the unmatched path itself as "not-found"; it isn't part of the link.
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      v === undefined || k === "not-found"
        ? []
        : (Array.isArray(v) ? v : [v]).map((x) => [k, String(x)])
    )
  ).toString();
  const webUrl = `${link.web}${pathname}${query ? `?${query}` : ""}#noapp`;
  const goHome = () => router.replace("/home");

  return (
    <Screen title="Page not found" onBack={goHome}>
      <ReadableColumn>
        <EmptyState
          icon="compass-outline"
          title={native ? "This page needs a newer THE SHED" : "There's nothing here"}
          message={
            native
              ? "It may be new since this version of the app. Open it on the web for now, or update the app."
              : "The link may be wrong, or the page may have moved."
          }
        />
        <View style={{ gap: spacing.sm, alignItems: "center" }}>
          {native ? (
            <Btn
              title="Open on the Web"
              icon="open-outline"
              onPress={() => void Linking.openURL(webUrl).catch(() => {})}
            />
          ) : null}
          {native && store ? (
            <Btn
              title="Update THE SHED"
              variant="tonal"
              icon="download-outline"
              onPress={() => void Linking.openURL(store).catch(() => {})}
            />
          ) : null}
          <Btn title="Go Home" variant="ghost" onPress={goHome} />
        </View>
      </ReadableColumn>
    </Screen>
  );
}
