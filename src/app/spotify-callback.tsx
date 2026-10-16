import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { Text, View } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export default function SpotifyCallback() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Only use the handoff for local development.
    if (window.location.hostname !== "127.0.0.1") return;

    const opener = window.opener;
    if (!opener) return;

    const params = new URLSearchParams(window.location.search);

    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (!state || (!code && !error)) return;

    // Send the OAuth result only to our local SHED website.
    opener.postMessage(
      {
        type: "SHED_SPOTIFY_CALLBACK",
        code,
        state,
        error,
      },
      "http://localhost:8081",
    );

    window.close();
  }, []);

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: 16 }}>
        Completing Spotify connection...
      </Text>
    </View>
  );
}
