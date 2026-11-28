import { FARMER, NPC } from "../../shared/world";

export type Tab = "furniture" | "wallpaper" | "seeds" | "animals" | "sell";
export type Keeper = "sijin" | "josh";

export const SHOP_TABS: Record<Keeper, readonly { id: Tab; icon: string; label: string }[]> = {
  sijin: [
    { id: "furniture", icon: "🛋️", label: "Furniture" },
    { id: "wallpaper", icon: "🖼️", label: "Wallpaper" },
  ],
  josh: [
    { id: "seeds", icon: "🌱", label: "Seeds" },
    { id: "animals", icon: "🐔", label: "Animals and feed" },
    { id: "sell", icon: "🧺", label: "Sell" },
  ],
};

export const KEEPERS = { sijin: NPC, josh: FARMER } as const;

export const FARM_OFFERS_FROM = FARMER;
