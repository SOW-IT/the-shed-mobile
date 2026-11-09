const removeVideoLabels = (value: string): string =>
  value
    .replace(
      /\s*[\[(]\s*(?:official\s+)?(?:music\s+video|lyric\s+video|video|lyrics?|audio|visualizer|live)\s*[\])]/gi,
      "",
    )
    .replace(/\s*[\[(]\s*(?:4k|hd)?\s*remaster(?:ed)?\s*[\])]/gi, "")
    .replace(
      /\s*[-–—|]\s*(?:official\s+)?(?:music\s+video|lyric\s+video|lyrics?|audio|visualizer)\s*$/gi,
      "",
    )
    .replace(
      /\s+(?:official\s+)?(?:lyric\s+video|music\s+video|lyrics?\s+video)\s*$/gi,
      "",
    )
    .trim();

export const cleanYouTubeTitle = (title: string, artist: string): string => {
  let cleaned = removeVideoLabels(title);
  const artistName = artist.trim();

  if (!artistName) return cleaned;

  const escapedArtist = artistName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  cleaned = cleaned.replace(
    new RegExp(`^${escapedArtist}\\s*[-–—|:]\\s*`, "i"),
    "",
  );

  cleaned = cleaned.replace(
    new RegExp(`\\s*[-–—|:]\\s*${escapedArtist}$`, "i"),
    "",
  );

  return cleaned.trim() || removeVideoLabels(title);
};

export const parseYouTubeSong = (
  videoTitle: string,
  channelName: string,
): { title: string; artist: string } => {
  const cleaned = removeVideoLabels(videoTitle);
  // YouTube Music's auto-generated channels are named "<Artist> - Topic".
  const channel =
    channelName.trim().replace(/\s+-\s+Topic$/i, "") || "Unknown artist";

  const parts = cleaned
    .split(/\s+[-–—|]\s+/)
    .map((part) => removeVideoLabels(part))
    .filter(Boolean);

  if (parts.length !== 2) {
    return {
      title: cleaned,
      artist: channel,
    };
  }

  const [first, second] = parts;

  const normalized = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const channelNormalized = normalized(channel);

  // If either side matches the channel, use that as the artist.
  if (normalized(first) === channelNormalized) {
    return { artist: first, title: second };
  }

  if (normalized(second) === channelNormalized) {
    return { artist: second, title: first };
  }

  // Titles containing video labels often put the song first.
  const songFirst = /(?:lyric|lyrics|music video|official audio)/i.test(
    videoTitle.split(/\s+[-–—|]\s+/)[0] ?? "",
  );

  if (songFirst) {
    return { title: first, artist: second };
  }

  // Conventional YouTube format: Artist - Song
  return { artist: first, title: second };
};
