import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";

const clientId = process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID ?? "";
const redirectUri = "theshedmobile://spotify-callback";
const tokenKey = "shed_spotify_oauth_v1";
const discovery = {
  authorizationEndpoint: "https://accounts.spotify.com/authorize",
  tokenEndpoint: "https://accounts.spotify.com/api/token",
};

type Token = AuthSession.TokenResponseConfig;
type SpotifyTrack = {
  id?: string;
  name?: string;
  type?: string;
  is_local?: boolean;
  artists?: Array<{ name: string }>;
  album?: { images?: Array<{ url: string }> };
};
type PlaylistPage = {
  total?: number;
  items?: Array<{ item?: SpotifyTrack | null; track?: SpotifyTrack | null }>;
};

function playlistId(link: string) {
  try {
    const u = new URL(link.trim());
    if (!["open.spotify.com", "www.open.spotify.com"].includes(u.hostname))
      return null;
    return (
      u.pathname.match(
        /^\/(?:intl-[a-zA-Z-]+\/)?playlist\/([a-zA-Z0-9]+)\/?$/,
      )?.[1] ?? null
    );
  } catch {
    return null;
  }
}

export function useSpotifyPlaylist() {
  const [token, setToken] = useState<Token | null>(null);
  const tokenRef = useRef<Token | null>(null);
  const refreshRef = useRef<Promise<string> | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);

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

  const saveToken = async (next: Token) => {
    await SecureStore.setItemAsync(tokenKey, JSON.stringify(next));
    tokenRef.current = next;
    setToken(next);
  };

  const clearToken = async () => {
    tokenRef.current = null;
    setToken(null);
    await SecureStore.deleteItemAsync(tokenKey);
  };

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(tokenKey)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored) as Token;
        tokenRef.current = parsed;
        setToken(parsed);
      })
      .catch((error: unknown) =>
        console.warn("Spotify token restore failed", error),
      )
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!response) return;
    if (response.type !== "success" || !request?.codeVerifier) {
      setConnecting(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const next = await AuthSession.exchangeCodeAsync(
          {
            clientId,
            code: response.params.code,
            redirectUri,
            extraParams: { code_verifier: request.codeVerifier! },
          },
          discovery,
        );
        if (active) await saveToken(next.getRequestConfig());
      } catch (error: unknown) {
        if (active) console.warn("Spotify sign-in failed", error);
      } finally {
        if (active) setConnecting(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [response, request]);

  const connect = async () => {
    if (!clientId)
      throw new Error(
        "Set EXPO_PUBLIC_SPOTIFY_CLIENT_ID in your Expo environment.",
      );
    if (!request) throw new Error("Spotify sign-in is not ready yet.");
    setConnecting(true);
    try {
      await promptAsync();
    } catch (error) {
      setConnecting(false);
      throw error;
    }
  };

  const disconnect = async () => {
    await clearToken();
  };

  const accessToken = async (forceRefresh = false): Promise<string> => {
    const current = tokenRef.current;
    if (!current) throw new Error("Connect your Spotify account first.");

    const expiresAt =
      current.issuedAt && current.expiresIn
        ? current.issuedAt + current.expiresIn
        : 0;
    if (!forceRefresh && expiresAt > Date.now() / 1000 + 60)
      return current.accessToken;

    // Reuse one in-flight refresh instead of racing refresh-token rotations.
    if (refreshRef.current) return refreshRef.current;

    if (!current.refreshToken) {
      await clearToken();
      throw new Error("Spotify connection expired. Please reconnect Spotify.");
    }

    const pending = (async () => {
      try {
        const refreshed = await AuthSession.refreshAsync(
          { clientId, refreshToken: current.refreshToken! },
          discovery,
        );
        const next: Token = {
          ...refreshed.getRequestConfig(),
          refreshToken: refreshed.refreshToken ?? current.refreshToken,
        };
        // Don't restore a token after the user explicitly disconnected.
        if (tokenRef.current !== current)
          throw new Error("Spotify connection changed. Please try again.");
        await saveToken(next);
        return next.accessToken;
      } catch (error: unknown) {
        // An invalid refresh token requires reconnecting. Keep credentials for
        // transient errors (e.g. network failure), so retry remains possible.
        const status = (error as { status?: number })?.status;
        const message = error instanceof Error ? error.message : String(error);
        if (
          status === 400 ||
          status === 401 ||
          /invalid_grant/i.test(message)
        ) {
          if (tokenRef.current === current) await clearToken();
          throw new Error(
            "Spotify authorization expired. Please reconnect Spotify.",
          );
        }
        throw error;
      }
    })();
    refreshRef.current = pending;
    try {
      return await pending;
    } finally {
      if (refreshRef.current === pending) refreshRef.current = null;
    }
  };

  const spotifyFetch = async (url: string): Promise<Response> => {
    let access = await accessToken();
    let result = await fetch(url, {
      headers: { Authorization: `Bearer ${access}` },
    });
    if (result.status === 401) {
      access = await accessToken(true);
      result = await fetch(url, {
        headers: { Authorization: `Bearer ${access}` },
      });
    }
    return result;
  };

  const importPlaylist = async (link: string) => {
    const id = playlistId(link);
    if (!id) throw new Error("Please paste a valid Spotify playlist URL.");
    const metadataResponse = await spotifyFetch(
      `https://api.spotify.com/v1/playlists/${id}?fields=name`,
    );
    if (!metadataResponse.ok)
      throw new Error(
        `Spotify playlist unavailable (${metadataResponse.status}). You may need to own or collaborate on it.`,
      );
    const metadata: { name?: string } = await metadataResponse.json();
    const response = await spotifyFetch(
      `https://api.spotify.com/v1/playlists/${id}/items?limit=50&offset=0`,
    );
    if (!response.ok)
      throw new Error(
        `Spotify denied access to playlist songs (${response.status}). Only eligible playlists can be imported.`,
      );
    const page: PlaylistPage = await response.json();
    const seen = new Set<string>();
    const songs = (page.items ?? []).flatMap((entry) => {
      const track = entry.item ?? entry.track;
      if (
        !track?.id ||
        !track.name ||
        track.is_local ||
        (track.type && track.type !== "track") ||
        seen.has(track.id)
      )
        return [];
      seen.add(track.id);
      return [
        {
          title: track.name,
          artist: (track.artists ?? []).map((a) => a.name).join(", "),
          link: `https://open.spotify.com/track/${track.id}`,
          albumArtUrl: track.album?.images?.[0]?.url,
        },
      ];
    });
    return {
      name: metadata.name ?? "Spotify playlist",
      songs,
      total: page.total ?? songs.length,
      limited: (page.total ?? 0) > 50,
    };
  };

  return {
    connected: !!token,
    ready,
    connecting,
    connect,
    disconnect,
    importPlaylist,
  };
}
