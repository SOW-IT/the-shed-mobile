export type ScreenHeaderAction<Icon = string> = {
  label: string;
  icon?: Icon | null;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
  disabled?: boolean;
};

export type ScreenHeader<Icon = string> = {
  title: string;
  icon?: Icon;
  action?: ScreenHeaderAction<Icon> | null;
  info?: { onPress: () => void; accessibilityLabel: string } | null;
};

type HeaderPlacement<Icon> = {
  topBar: ScreenHeader<Icon> | null;
  page: ScreenHeader<Icon> | null;
};

export const headerPlacement = <Icon,>(wide: boolean, header: ScreenHeader<Icon> | undefined): HeaderPlacement<Icon> => {
  if (!header) return { topBar: null, page: null };
  return wide ? { topBar: null, page: header } : { topBar: header, page: null };
};

const TITLE_GAP = 12;

export const titleInsets = (edge: number, leftWidth: number, rightWidth: number) => ({
  left: Math.max(edge, Math.ceil(leftWidth) + TITLE_GAP),
  right: Math.max(edge, Math.ceil(rightWidth) + TITLE_GAP),
});
