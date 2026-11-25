import { readStored } from "@/lib/deviceStorage";
import { useCallback, useEffect, useState } from "react";
import { NAME_STYLES, NAMES_SETTING_KEY, styledName, type NameStyle } from "../../../shared/names";

/**
 * The World's Names setting, read from the device for the games outside the
 * World (which can't load the World's settings). Until it's read, or if it
 * was never set, names show the World's default way.
 */
export const useSavedNames = () => {
  const [style, setStyle] = useState<NameStyle>("short");
  useEffect(() => {
    let live = true;
    readStored(NAMES_SETTING_KEY).then(
      (saved) => {
        if (live && NAME_STYLES.includes(saved as NameStyle)) setStyle(saved as NameStyle);
      },
      () => undefined
    );
    return () => {
      live = false;
    };
  }, []);
  return useCallback((name: string) => styledName(name, style), [style]);
};
