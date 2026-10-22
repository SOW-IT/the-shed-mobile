import { type RefObject, useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from "react-native";
import { usePagerTopBarInset } from "@/components/PagerScreen";

export function useListTopOnChange(listRef: RefObject<ScrollViewInstance | null>, scopeKey: string) {
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
