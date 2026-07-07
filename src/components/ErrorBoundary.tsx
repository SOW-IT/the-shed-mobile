import { Component, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppTheme } from "../theme";

/**
 * Last line of defence: without this, any uncaught render/query error
 * unmounts the whole React tree and the user sees a blank screen.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
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

/**
 * The fallback UI is a function component so it can read the theme — the class
 * boundary can't use hooks. Themed so the error screen matches the rest of the
 * app in dark mode instead of flashing a light cream panel.
 */
function ErrorFallback({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Text style={[styles.title, { color: theme.text }]}>
        Something went wrong
      </Text>
      <Text style={[styles.message, { color: theme.muted }]}>
        {String(error.message ?? error)}
      </Text>
      <Pressable
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={onRetry}
      >
        <Text style={[styles.buttonText, { color: theme.onPrimary }]}>
          Try again
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
