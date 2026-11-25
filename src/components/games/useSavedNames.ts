import { readStored } from "@/lib/deviceStorage";
import { NavigationContext } from "expo-router/react-navigation";
import { useCallback, useContext, useEffect, useState } from "react";
import { NAME_STYLES, NAMES_SETTING_KEY, styledName, type NameStyle } from "../../../shared/names";

/**
 * The World's Names setting, read from the device for the games outside the
 * World (which can't load the World's settings). Read again whenever the
 * screen comes back into focus, so a change made in the World shows on
 * return. Until it's read, or if it was never set, names show the World's
 * default way.
 */
export const useSavedNames = () => {
  const [style, setStyle] = useState<NameStyle>("short");
  // Undefined outside a navigator (the offline games' modal): read once there.
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    let live = true;
    const read = () => {
      readStored(NAMES_SETTING_KEY).then(
        (saved) => {
          if (live && NAME_STYLES.includes(saved as NameStyle)) setStyle(saved as NameStyle);
        },
        () => undefined
      );
    };
    read();
    const unsubscribe = navigation?.addListener("focus", read);
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [navigation]);
  return useCallback((name: string) => styledName(name, style), [style]);
};
