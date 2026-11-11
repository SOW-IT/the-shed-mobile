import { useLocalSearchParams } from "expo-router";
import { useState } from "react";

export const useLandingTab = <Landing extends string | null>(landing: Landing) => {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const linked = typeof tab === "string" ? tab : null;
  const [active, setActive] = useState<string | null>(linked);
  const [seenLink, setSeenLink] = useState(linked);
  if (linked !== seenLink) {
    setSeenLink(linked);
    if (linked !== null) setActive(linked);
  }
  if (active === null && landing !== null && linked === null) setActive(landing);
  const wanted: string | Landing = active ?? landing;
  return [wanted, setActive] as const;
};
