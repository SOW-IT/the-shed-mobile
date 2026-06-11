import { ConvexAuthProvider } from "@convex-dev/auth/react";
import {
  Authenticated,
  AuthLoading,
  ConvexReactClient,
  Unauthenticated,
  useQuery,
} from "convex/react";
import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, Platform, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { SignInScreen } from "@/components/SignInScreen";
import { useAppTheme } from "@/theme";

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

// Tokens live in the platform keychain on device; localStorage on web.
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

const AppTabs = () => {
  const me = useQuery(api.directory.me);
  const t = useAppTheme();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: t.primary }}>
      <Tabs.Screen name="index" options={{ title: "My Requests" }} />
      <Tabs.Screen name="org" options={{ title: "Org Chart" }} />
      <Tabs.Screen
        name="review"
        options={{ title: "To Review", href: me?.isApprover ? "/review" : null }}
      />
      <Tabs.Screen
        name="all"
        options={{ title: "All Requests", href: me?.isFinance ? "/all" : null }}
      />
      <Tabs.Screen
        name="admin"
        options={{ title: "Admin", href: me?.isAdmin ? "/admin" : null }}
      />
    </Tabs>
  );
};

export default function RootLayout() {
  const t = useAppTheme();
  return (
    <ThemeProvider value={t.dark ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <ConvexAuthProvider
        client={convex}
        storage={Platform.OS === "web" ? undefined : secureStorage}
      >
        <AuthLoading>
          <View
            style={{ flex: 1, justifyContent: "center", backgroundColor: t.background }}
          >
            <ActivityIndicator size="large" color={t.primary} />
          </View>
        </AuthLoading>
        <Unauthenticated>
          <SignInScreen />
        </Unauthenticated>
        <Authenticated>
          <AppTabs />
        </Authenticated>
      </ConvexAuthProvider>
    </ThemeProvider>
  );
}
