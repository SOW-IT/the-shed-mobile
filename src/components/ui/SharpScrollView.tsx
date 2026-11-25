import type { ComponentPropsWithRef } from "react";
import { ScrollView } from "react-native";

export const SharpScrollView = (props: ComponentPropsWithRef<typeof ScrollView>) => <ScrollView {...props} />;
