import type { ViewStyle } from "react-native";

export const NO_EDGE_EFFECTS = { top: "hidden", right: "hidden", bottom: "hidden", left: "hidden" } as const;

const PLACEMENT = new Set<string>([
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "start",
  "end",
  "zIndex",
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "alignSelf",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "marginHorizontal",
  "marginVertical",
  "marginStart",
  "marginEnd",
]);

const FILL: ViewStyle = { flexGrow: 1, flexShrink: 1 };

export const splitScrollStyle = (style: Readonly<ViewStyle> | null | undefined) => {
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(style ?? {})) {
    if (PLACEMENT.has(key)) outer[key] = value;
    else inner[key] = value;
  }
  const flexSet = outer.flex !== undefined;
  return {
    outer: { ...(flexSet ? null : FILL), ...outer } as ViewStyle,
    inner: { ...inner, ...FILL } as ViewStyle,
  };
};
