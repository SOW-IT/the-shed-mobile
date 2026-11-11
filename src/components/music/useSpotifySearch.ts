import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { errorMessage } from "@/components/ui";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type SpotifySearchResult = FunctionReturnType<typeof api.spotify.searchTracks>[number];

export const useSpotifySearch = () => {
  const searchSpotify = useAction(api.spotify.searchTracks);
  const [query, setQuery] = useState("");
  const term = useDebouncedValue(query.trim(), 600);
  const [search, setSearch] = useState<{
    query: string;
    results?: SpotifySearchResult[];
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (term.length < 2) return;
    let current = true;
    searchSpotify({ query: term })
      .then((results) => {
        if (current) setSearch({ query: term, results });
      })
      .catch((searchError: unknown) => {
        if (current) {
          setSearch({ query: term, error: errorMessage(searchError) });
        }
      });
    return () => {
      current = false;
    };
  }, [term, searchSpotify]);
  const long = query.trim().length >= 2;
  return {
    query,
    setQuery,
    shown: long && search?.query === term ? search : null,
    searching: long && search?.query !== query.trim(),
  };
};
