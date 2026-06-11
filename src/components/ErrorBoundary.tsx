import { Component, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.message}>
            {String(this.state.error.message ?? this.state.error)}
          </Text>
          <Pressable
            style={styles.button}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
    backgroundColor: "#F5F3E3", // brand cream
  },
  title: { fontSize: 20, fontWeight: "800", color: "#0F2523" },
  message: { color: "#5C6B62", textAlign: "center" },
  button: {
    backgroundColor: "#283E42",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: { color: "#F5F3E3", fontWeight: "700" },
});
