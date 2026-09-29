import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import { PAGER_TOP_BAR_INSET } from "@/components/PagerScreen";

/**
 * For a pager tab's list: when its search, filters or sort change, jump back
 * to the first result. Otherwise a list scrolled deep stays scrolled past the
 * end of the new, shorter results and looks empty. The top bar stays collapsed
 * if it already was. Returns the handler for the list's scroll-end events.
 */
export function useListTopOnChange(listRef: RefObject<ScrollView | null>, scopeKey: string) {
  const offset = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (offset.current <= PAGER_TOP_BAR_INSET) return;
    listRef.current?.scrollTo({ y: PAGER_TOP_BAR_INSET, animated: false });
    offset.current = PAGER_TOP_BAR_INSET;
  }, [listRef, scopeKey]);
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);
}
