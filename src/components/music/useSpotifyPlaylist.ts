import { useAction, useMutation, useQuery } from "convex/react";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { api } from "../../../convex/_generated/api";

WebBrowser.maybeCompleteAuthSession();

const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";

const redirectUri =
  Platform.OS === "web"
    ? __DEV__
      ? "http://127.0.0.1:8081/spotify-callback"
      : "https://theshed.sow.org.au/spotify-callback"
    : "theshedmobile://spotify-callback";

const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

export function useSpotifyPlaylist() {
  const connect = async () => {
    if (!clientId) {
      throw new Error("EXPO_PUBLIC_SPOTIFY_CLIENT_ID is missing.");
    }

    if (!request) {
      throw new Error("Spotify login is not ready.");
    }

    setConnecting(true);

    try {
      if (Platform.OS === "web" && __DEV__) {
        // The callback sends the result to this window.
        // AuthSession manages the popup internally.
        await promptAsync();
      } else {
        await promptAsync();
      }
    } catch (error) {
      setConnecting(false);
      throw error;
    }
  };
  const connection = useQuery(api.spotifyConnections.getConnection);
  const connectSpotify = useAction(api.spotifyConnections.connect);
  const disconnectSpotify = useMutation(api.spotifyConnections.disconnect);
  const importSpotifyPlaylist = useAction(
    api.spotifyConnections.importPlaylist,
  );

  const [connecting, setConnecting] = useState(false);
  const processedCodes = useRef(new Set<string>());
  const spotifyPopupRef = useRef<Window | null>(null);
  const finishConnection = useCallback(
    async (code: string, codeVerifier: string) => {
      if (processedCodes.current.has(code)) return;

      processedCodes.current.add(code);

      try {
        await connectSpotify({
          code,
          codeVerifier,
          redirectUri,
        });
      } catch (error) {
        console.warn("Spotify connection failed:", error);
      } finally {
        setConnecting(false);
      }
    },
    [connectSpotify],
  );

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ["playlist-read-private", "playlist-read-collaborative"],
      usePKCE: true,
    },
    discovery,
  );

  // Standard OAuth callback: native mobile and same-origin web.
  useEffect(() => {
    if (!response) return;

    if (response.type !== "success") {
      setConnecting(false);
      return;
    }

    const code = response.params.code;
    const codeVerifier = request?.codeVerifier;

    if (!code || !codeVerifier) {
      setConnecting(false);
      return;
    }

    void finishConnection(code, codeVerifier);
  }, [response, request, finishConnection]);

  // Localhost -> 127.0.0.1 OAuth callback handoff.
  useEffect(() => {
    if (Platform.OS !== "web" || !__DEV__) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== "http://127.0.0.1:8081") return;
      if (event.source == null) return;

      const data = event.data;

      if (
        !data ||
        data.type !== "SHED_SPOTIFY_CALLBACK" ||
        typeof data.state !== "string"
      ) {
        return;
      }

      // Reject callbacks that don't match our pending OAuth request.
      if (!request?.state || data.state !== request.state) {
        // Ignore OAuth callbacks belonging to another hook instance.
        return;
      }

      if (data.error) {
        console.warn("Spotify authorization error:", data.error);
        setConnecting(false);
        return;
      }

      if (typeof data.code !== "string" || !request.codeVerifier) {
        setConnecting(false);
        return;
      }

      void finishConnection(data.code, request.codeVerifier);
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [request, finishConnection]);

  const disconnect = async () => {
    await disconnectSpotify();
  };

  const importPlaylist = async (link: string) => {
    return await importSpotifyPlaylist({ link });
  };

  const refreshConnection = async () => {
    // Convex automatically keeps this query updated.
  };

  return {
    connected: connection?.connected ?? false,
    ready: connection !== undefined,
    connecting,
    connect,
    disconnect,
    importPlaylist,
    refreshConnection,
  };
}
