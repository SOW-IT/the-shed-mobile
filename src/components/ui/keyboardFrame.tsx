import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from "react-native";
import Reanimated, { useAnimatedStyle } from "react-native-reanimated";
import { sheetKeyboardPadding } from "@/hooks/keyboardOverlap";
import { useKeyboardHeight } from "@/hooks/useKeyboardInset";

type FrameProps = { offset: number; style: StyleProp<ViewStyle>; children: ReactNode };

const TrackedFrame = ({ offset, style, children }: FrameProps) => {
  const keyboard = useKeyboardHeight();
  const lift = useAnimatedStyle(() => ({ paddingBottom: sheetKeyboardPadding(keyboard.get(), offset) }));
  return (
    <Reanimated.View pointerEvents="box-none" style={[style, lift]}>
      {children}
    </Reanimated.View>
  );
};

const ResizedFrame = ({ offset, style, children }: FrameProps) => (
  <KeyboardAvoidingView behavior="height" keyboardVerticalOffset={offset} pointerEvents="box-none" style={style}>
    {children}
  </KeyboardAvoidingView>
);

export const KeyboardFrame = Platform.OS === "ios" ? TrackedFrame : ResizedFrame;
