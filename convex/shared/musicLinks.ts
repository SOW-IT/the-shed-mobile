const SPOTIFY_HOSTS = ["open.spotify.com", "www.open.spotify.com"];
const YOUTUBE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
];
const YOUTUBE_SHORT_HOSTS = ["youtu.be", "www.youtu.be"];
const YOUTUBE_VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
};

/** Extract a Spotify track ID, ignoring query parameters and regional URL prefixes. */
export function spotifyTrackId(value: string): string | null {
  const url = parseUrl(value);
  if (
    !url ||
    !["https:", "http:"].includes(url.protocol) ||
    !SPOTIFY_HOSTS.includes(url.hostname)
  ) {
    return null;
  }
  return (
    url.pathname.match(
      /^\/(?:intl-[a-zA-Z-]+\/)?track\/([a-zA-Z0-9]+)\/?$/,
    )?.[1] ?? null
  );
}

export function youtubeVideoId(value: string): string | null {
  const url = parseUrl(value);
  if (!url || !["https:", "http:"].includes(url.protocol)) return null;
  const host = url.hostname.toLowerCase();
  let videoId: string | null = null;
  if (YOUTUBE_SHORT_HOSTS.includes(host)) {
    videoId = url.pathname.split("/")[1] ?? null;
  } else if (YOUTUBE_HOSTS.includes(host)) {
    videoId =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : (url.pathname.match(
            /^\/(?:shorts|live|embed)\/([a-zA-Z0-9_-]{11})(?=\/|$)/,
          )?.[1] ?? null);
  }
  return videoId && YOUTUBE_VIDEO_ID.test(videoId) ? videoId : null;
}

export const spotifyTrackUrl = (value: string): string | null => {
  const id = spotifyTrackId(value);
  return id ? `https://open.spotify.com/track/${id}` : null;
};

export const youtubeVideoUrl = (value: string): string | null => {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
};

export const youtubeThumbnailUrl = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

export const songLinkKey = (value: string): string =>
  spotifyTrackUrl(value) ??
  youtubeVideoUrl(value) ??
  parseUrl(value)?.href ??
  value.trim();

const SPOTIFY_ARTWORK_HOST = /(^|\.)scdn\.co$|(^|\.)spotifycdn\.com$/;

export const songArtworkUrl = (
  link: string,
  albumArtUrl: string | undefined,
): string | undefined => {
  const videoId = youtubeVideoId(link);
  if (videoId) return youtubeThumbnailUrl(videoId);
  if (!spotifyTrackId(link) || !albumArtUrl) return undefined;
  const artwork = parseUrl(albumArtUrl);
  return artwork?.protocol === "https:" &&
    SPOTIFY_ARTWORK_HOST.test(artwork.hostname)
    ? artwork.toString()
    : undefined;
};
