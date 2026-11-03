import { Component, ErrorInfo, ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { isStaleReleaseError, RELOAD_NEEDED_TEXT } from "@/lib/appErrorKinds";
import { reportError, staleReload } from "@/lib/errorReporting";
import { useAppTheme } from "../theme";

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; reloading: boolean }
> {
  state = { error: null as Error | null, reloading: false };

  static getDerivedStateFromError(error: Error) {
    return { error, reloading: isStaleReleaseError(error) && staleReload.canReload() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleReleaseError(error) && staleReload.reload()) return;
    if (this.state.reloading) this.setState({ reloading: false });
    reportError(error, info.componentStack);
  }

  render() {
    if (this.state.reloading) return <ReloadingNotice />;
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

const reloadPage = () => {
  if (typeof window !== "undefined") window.location.reload();
};

function ReloadingNotice() {
  const theme = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} />
      <Text style={[styles.message, { color: theme.muted }]}>
        Loading the latest version of The SHED…
      </Text>
    </View>
  );
}

function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const theme = useAppTheme();
  const reloadInstead = Platform.OS === "web" && isStaleReleaseError(error);
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Something went wrong
      </Text>
      <Text style={[styles.message, { color: theme.muted }]}>
        {reloadInstead ? RELOAD_NEEDED_TEXT : String(error.message ?? error)}
      </Text>
      <Pressable
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={reloadInstead ? reloadPage : onRetry}
      >
        <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
          {reloadInstead ? "Reload" : "Try again"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: "800" },
  message: { textAlign: "center" },
  button: {
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: { fontWeight: "700" },
});
