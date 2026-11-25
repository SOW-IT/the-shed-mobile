import { useEffect, useRef, useState } from "react";
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent, PanResponder } from "react-native";
import { isSheetDrag, pullCloses, sheetDragOffset, swipeCloses } from "@shared/sheetSwipe";
import { USE_NATIVE_DRIVER } from "@/theme";

/**
 * Lets a sheet be swiped closed: its header drags down, and on iOS its list
 * pulls down past the top. Spread `headerHandlers` on the header, put
 * `dragStyle` on the sheet's card and `onScrollEndDrag` on its list.
 */
// The latest onClose for the gesture callbacks, which are made once.
const useLatestClose = (onClose: () => void) => {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  return ref;
};

export const useSwipeToClose = (visible: boolean, onClose: () => void) => {
  const [drag] = useState(() => new Animated.Value(0));
  const close = useLatestClose(onClose);
  // A sheet closed by a swipe fades out where it was let go; the next open
  // starts back in place.
  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);
  const [responder] = useState(() => {
    const settle = () =>
      Animated.spring(drag, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 4 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => isSheetDrag(gesture.dx, gesture.dy),
      onPanResponderMove: (_event, gesture) => drag.setValue(sheetDragOffset(gesture.dy)),
      onPanResponderRelease: (_event, gesture) => {
        if (swipeCloses(gesture.dy, gesture.vy)) close.current();
        else settle();
      },
      onPanResponderTerminate: settle,
    });
  });
  return {
    headerHandlers: responder.panHandlers,
    dragStyle: { transform: [{ translateY: drag }] },
    onScrollEndDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (pullCloses(event.nativeEvent.contentOffset.y)) close.current();
    },
  };
};
