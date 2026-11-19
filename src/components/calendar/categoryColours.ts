import { isTagColour, TAG_COLOUR_HEX } from "@shared/attendanceTags";
import { campusColourOf, type CalendarCategory } from "@shared/calendar";

// Mid-tone colours that read on both the cream and the dark theme.
export const CATEGORY_COLOURS: Record<CalendarCategory, string> = {
  twig: "#2f8a5f",
  ppn: "#8a63c7",
  weekly: "#3a86c8",
  campus: "#d07a2d",
  sow: "#14958a",
  event: "#6b7f99",
  deadline: "#d1453b",
};

// One picked for a calendar entry, else its campus's, else its category's.
export const eventColour = (event: {
  category: CalendarCategory;
  subgroups: string[];
  colour?: string | null;
}): string =>
  (isTagColour(event.colour) ? TAG_COLOUR_HEX[event.colour] : undefined) ??
  campusColourOf(event.category, event.subgroups) ??
  CATEGORY_COLOURS[event.category];
