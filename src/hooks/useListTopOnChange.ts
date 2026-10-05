import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";
import { usePagerTopBarInset } from "@/components/PagerScreen";

/**
 * For a pager tab's list: when its search, filters or sort change, jump back
 * to the first result. Otherwise a list scrolled deep stays scrolled past the
 * end of the new, shorter results and looks empty. The top bar stays collapsed
 * if it already was. Returns the handler for the list's scroll-end events.
 */
export function useListTopOnChange(listRef: RefObject<ScrollView | null>, scopeKey: string) {
  const offset = useRef(0);
  const first = useRef(true);
  const topBarInset = usePagerTopBarInset();
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (offset.current <= topBarInset) return;
    listRef.current?.scrollTo({ y: topBarInset, animated: false });
    offset.current = topBarInset;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new scope jumps the list, not a resize
  }, [listRef, scopeKey]);
  return useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);
}
