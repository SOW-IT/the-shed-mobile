import { query } from "./_generated/server";
import type { DesignField } from "../shared/designRequests";
import { optionalProfile } from "./model";

/**
 * The design request form, as the app shows it. Design requests are for
 * anything that isn't an event: an event's design and promotion go on its
 * event request's Marketing form (convex/eventRequestForm.ts).
 *
 * The app renders whatever this
 * sends, so changing a question, a hint or a choice is a backend deploy, not an
 * app release. Answers are stored by `key`: reword freely, but give a question
 * that asks something new a new key, and keep the keys with a `role` (the
 * department, due date and title a request is filed under).
 */
export const DESIGN_REQUEST_FIELDS: DesignField[] = [
  {
    key: "department",
    kind: "department",
    label: "Select department",
    shortLabel: "Department",
    required: true,
    role: "department",
    inSummary: true,
  },
  {
    key: "types",
    kind: "checkboxes",
    label: "What best describes your request?",
    shortLabel: "Request type",
    placeholder: "What kind of request is it?",
    required: true,
    options: [
      // Events now have their own requests; kept so older requests still read right.
      { value: "event", label: "Event-related", retired: true },
      { value: "promotion", label: "Promotional product (e.g. merch)" },
      { value: "pr", label: "PR-related (e.g. booklet)" },
      { value: "other", label: "Other" },
    ],
    otherOption: "other",
  },
  {
    key: "details",
    kind: "longText",
    label: "Please provide details of the project",
    shortLabel: "Project details",
    hint: "Project name, dates, target audience, theme, aim/purpose",
    required: true,
  },
  {
    key: "items",
    kind: "checkboxes",
    label: "What would you like us to design?",
    shortLabel: "What to design",
    placeholder: "What else would you like designed?",
    required: true,
    options: [
      { value: "brochure", label: "Brochure" },
      { value: "flyer", label: "Flyer" },
      { value: "booklet", label: "Booklet" },
      { value: "facebookBanner", label: "Facebook banner" },
      { value: "infographic", label: "Infographic" },
      { value: "invitation", label: "Invitation" },
      { value: "logo", label: "Logo (e.g. for SOW Camp)" },
      { value: "merchandise", label: "Merchandise" },
      { value: "poster", label: "Poster" },
      { value: "powerpoint", label: "PowerPoint presentation" },
      { value: "shortFormVideo", label: "Short Form Video (Reel)" },
      { value: "longFormVideo", label: "Long Form Video" },
      { value: "instagramPosts", label: "Instagram Posts" },
      { value: "other", label: "Other" },
    ],
    otherOption: "other",
    role: "title",
    inSummary: true,
  },
  {
    key: "visualStyle",
    kind: "longText",
    label:
      "Please provide examples of the theme/colour palette/visual style you'd like us to work with",
    shortLabel: "Visual style examples",
    hint: "You may share links.",
    required: true,
  },
  {
    key: "biblePassage",
    kind: "text",
    label: "What is the key Bible passage for the event?",
    shortLabel: "Key Bible passage",
    placeholder: "e.g. Isaiah 6:8",
    required: true,
    showWhen: { field: "types", includes: "event" },
    maxLength: 200,
  },
  {
    key: "keyMessage",
    kind: "longText",
    label: "What is the key message you would like to send out?",
    shortLabel: "Key message",
    required: true,
    inSummary: true,
  },
  {
    key: "promoBudget",
    kind: "money",
    label:
      "What is the budget for promotional materials (e.g. printing booklets, brochures or posters, or designing merch)?",
    shortLabel: "Promo materials budget",
    hint: "Please be in contact with Finance about this budget. Enter 0 if there's none.",
    required: true,
    max: 1_000_000,
  },
  {
    key: "dueDate",
    kind: "date",
    label: "When do you need the design by?",
    shortLabel: "Needed by",
    required: true,
    notInPast: true,
    role: "dueDate",
    inSummary: true,
  },
  {
    key: "multipleDrafts",
    kind: "yesNo",
    label: "Would you like multiple demos/drafts provided before the final design?",
    shortLabel: "Multiple drafts",
    required: true,
  },
  {
    key: "runByYou",
    kind: "yesNo",
    label: "Would you like us to run the design by you before finalising?",
    shortLabel: "Run by you before finalising",
    required: true,
  },
  {
    key: "otherInfo",
    kind: "longText",
    label: "Do you have any other information you would like to include?",
    shortLabel: "Other information",
    required: false,
  },
];

/** The design request questions, for the app to render. */
export const fields = query({
  args: {},
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return null;
    return DESIGN_REQUEST_FIELDS;
  },
});
