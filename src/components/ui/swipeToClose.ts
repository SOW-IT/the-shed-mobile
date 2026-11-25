import { useEffect, useRef, useState } from "react";
import { Animated, type NativeScrollEvent, type NativeSyntheticEvent, PanResponder } from "react-native";
import { isSheetDrag, pullCloses, sheetDragOffset, swipeCloses } from "@shared/sheetSwipe";
import { USE_NATIVE_DRIVER } from "@/theme";

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
  useEffect(() => {
    if (visible) drag.setValue(0);
  }, [visible, drag]);
  const [responder] = useState(() => {
    const settle = () =>
      Animated.spring(drag, { toValue: 0, useNativeDriver: USE_NATIVE_DRIVER, bounciness: 4 }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) => isSheetDrag(gesture.dx, gesture.dy),
      onPanResponderTerminationRequest: () => false,
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
