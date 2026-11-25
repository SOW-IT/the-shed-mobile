import { type RefObject, useEffect } from "react";
import { Animated, Dimensions, Keyboard, Platform } from "react-native";
import Reanimated, { type SharedValue, useAnimatedKeyboard, useAnimatedStyle, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { keyboardOverlap } from "./keyboardOverlap";

type Measurable = { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void };

const EDGE_TO_EDGE = { isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true };

const useTrackedKeyboardHeight = (): SharedValue<number> => useAnimatedKeyboard(EDGE_TO_EDGE).height;

const useNoKeyboardHeight = (): SharedValue<number> => useSharedValue(0);

export const useKeyboardHeight = Platform.OS === "web" ? useNoKeyboardHeight : useTrackedKeyboardHeight;

const useAndroidKeyboardInset = (frame: RefObject<Measurable | null>, frameShrinks = true) => {
  const keyboard = useTrackedKeyboardHeight();
  const screenHeight = useSharedValue(Dimensions.get("screen").height);
  const frameBottom = useSharedValue(Dimensions.get("screen").height);
  const inset = useDerivedValue(() => keyboardOverlap(frameBottom.get(), screenHeight.get(), keyboard.get()));
  useEffect(() => {
    const measure = () => {
      screenHeight.set(Dimensions.get("screen").height);
      frame.current?.measureInWindow((_x, y, _width, height) => frameBottom.set(y + height + (frameShrinks ? inset.get() : 0)));
    };
    measure();
    const subs = [
      Keyboard.addListener("keyboardDidShow", measure),
      Keyboard.addListener("keyboardDidHide", measure),
      Dimensions.addEventListener("change", measure),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [frame, frameShrinks, frameBottom, screenHeight, inset]);
  return useAnimatedStyle(() => ({ marginBottom: inset.get() }));
};

const noInset = {};

const useNoKeyboardInset = (_frame: RefObject<Measurable | null>, _frameShrinks?: boolean) => noInset;

export const useKeyboardInset = Platform.OS === "android" ? useAndroidKeyboardInset : useNoKeyboardInset;

export const KeyboardScrollView = Reanimated.createAnimatedComponent(Animated.ScrollView);
