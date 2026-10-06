import { query } from "./_generated/server";
import type { FormField, FormFieldOption } from "../shared/forms";
import { REGISTRATION_GOAL_HINT, type EventSize } from "../shared/eventRequests";
import { optionalProfile } from "./model";

/**
 * The event request forms, as the app shows them. The app renders whatever
 * this sends, so rewording a question, a hint or a choice is a backend
 * deploy, not an app release. Answers are stored by `key`: reword freely, but
 * give a question that asks something new a new key, and keep the keys with
 * a `role` (what an event is filed and listed under).
 */

/** The event itself: the old web app's "Make an Event Request" form. */
export const EVENT_FIELDS: FormField[] = [
  {
    key: "name",
    kind: "text",
    label: "Name of the event",
    shortLabel: "Event name",
    required: true,
    maxLength: 200,
    role: "title",
    inSummary: true,
  },
  {
    key: "department",
    kind: "department",
    label: "Lead department",
    shortLabel: "Lead department",
    hint: "Your department's members and Head can fill in and update this event's forms.",
    required: true,
    role: "department",
    inSummary: true,
  },
  {
    key: "purpose",
    kind: "longText",
    label: "What is the purpose of your event?",
    shortLabel: "Purpose",
    hint: "What is it, and why are we running it?",
    required: true,
  },
  {
    key: "goals",
    kind: "longText",
    label: "What are the goals of your event?",
    shortLabel: "Goals",
    required: true,
  },
  {
    key: "theme",
    kind: "text",
    label: "What is the theme of the event?",
    shortLabel: "Theme",
    required: false,
    maxLength: 300,
  },
  {
    key: "location",
    kind: "text",
    label: "Where is the location of the event?",
    shortLabel: "Location",
    required: true,
    maxLength: 300,
    role: "location",
    inSummary: true,
  },
  {
    key: "registrationGoal",
    kind: "number",
    label: "What is the registration goal for the event?",
    shortLabel: "Registration goal",
    hint: REGISTRATION_GOAL_HINT,
    required: true,
    max: 100_000,
  },
  {
    key: "audience",
    kind: "choice",
    label: "Who is the target audience?",
    shortLabel: "Target audience",
    hint: "Internal: SOW members. External: people outside SOW.",
    required: true,
    options: [
      { value: "internal", label: "Internal" },
      { value: "external", label: "External" },
      { value: "all", label: "All" },
    ],
  },
  {
    key: "start",
    kind: "dateTime",
    label: "When does the event start?",
    shortLabel: "Starts",
    required: true,
    notInPast: true,
    role: "start",
    inSummary: true,
  },
  {
    key: "end",
    kind: "dateTime",
    label: "When does the event end?",
    shortLabel: "Ends",
    required: true,
    notBefore: "start",
    role: "end",
  },
  {
    key: "registrationOpen",
    kind: "dateTime",
    label: "When should registrations open?",
    shortLabel: "Registrations open",
    hint: "Leave blank if there's no registration.",
    required: false,
    notAfter: "start",
  },
  {
    key: "registrationClose",
    kind: "dateTime",
    label: "When should registrations close?",
    shortLabel: "Registrations close",
    required: false,
    notBefore: "registrationOpen",
    notAfter: "start",
  },
  {
    key: "notes",
    kind: "longText",
    label: "Any notes to add?",
    shortLabel: "Notes",
    required: false,
  },
];

const ALL: EventSize[] = ["small", "medium", "large"];
const MEDIUM_UP: EventSize[] = ["medium", "large"];
const LARGE: EventSize[] = ["large"];

const PRINTED: FormFieldOption[] = [
  { value: "brochures", label: "Brochures" },
  { value: "flyers", label: "Flyers", recommended: LARGE },
  { value: "invitations", label: "Invitations" },
  { value: "signage", label: "Signage", recommended: ALL },
  { value: "businessCards", label: "Business cards" },
  { value: "pamphlets", label: "Pamphlets" },
  { value: "posters", label: "Posters", recommended: LARGE },
  { value: "postcards", label: "Postcards" },
  { value: "merchandise", label: "Merchandise", recommended: LARGE },
  { value: "other", label: "Other" },
];

const DIGITAL: FormFieldOption[] = [
  { value: "logo", label: "Logo", recommended: ALL },
  { value: "powerpoint", label: "PowerPoint presentation", recommended: ALL },
  { value: "letterhead", label: "Letterhead", recommended: LARGE },
  { value: "facebookBanner", label: "Facebook event banner", recommended: ALL },
  { value: "instagramPosts", label: "Instagram posts", recommended: ALL },
  { value: "websiteBanner", label: "Website banner", recommended: ALL },
  { value: "promoVideo", label: "Promotion video", recommended: MEDIUM_UP },
  { value: "recapVideo", label: "Recap video", recommended: LARGE },
  { value: "reel", label: "Short form video (Reel)" },
  { value: "longFormVideo", label: "Long form video" },
  { value: "other", label: "Other" },
];

const PROMOTION: FormFieldOption[] = [
  { value: "photography", label: "Photography" },
  { value: "videography", label: "Videography", recommended: LARGE },
  { value: "instagramStories", label: "Instagram stories" },
  { value: "bibleVerse", label: "Bible verse", recommended: ALL },
  { value: "themePurpose", label: "Theme / purpose", recommended: ALL },
  { value: "saveTheDate", label: "Save the date", recommended: ALL },
  { value: "throwbackPhotos", label: "Throwback photos", recommended: MEDIUM_UP },
  { value: "directorsAddress", label: "Director's address", recommended: LARGE },
  { value: "registrationCountdown", label: "Registration countdown", recommended: ALL },
  { value: "prizeIncentive", label: "Prize / incentive", recommended: LARGE },
  { value: "sponsorships", label: "Sponsorships", recommended: LARGE },
  { value: "rulesFaqs", label: "Rules / FAQs", recommended: LARGE },
  { value: "merchandise", label: "Merchandise", recommended: LARGE },
  { value: "paidAds", label: "Paid ads", recommended: LARGE },
  { value: "campusPromotion", label: "Campus promotion", recommended: LARGE },
  { value: "finalReminders", label: "Final reminders / info", recommended: MEDIUM_UP },
  { value: "eventPhotos", label: "Event photos (after the event)", recommended: ALL },
  { value: "other", label: "Other" },
];

const PRINT_HINT = "What text to include, and how many copies to print.";
const VIDEO_HINT =
  "Ideas you'd like us to consider, and important info to include in the video (e.g. event dates).";

/** A details question for one ticked choice, asked only when it's ticked. */
const detailsFor = (
  field: string,
  option: FormFieldOption,
  hint: string,
  label = `${option.label}: details`
): FormField => ({
  key: `${field}_${option.value}`,
  kind: "longText",
  label,
  shortLabel: label,
  hint,
  required: false,
  showWhen: { field, includes: option.value },
});

const printedDetails = PRINTED.map((option) =>
  option.value === "other"
    ? detailsFor("printed", option, `What it is. ${PRINT_HINT}`, "Other printed design: details")
    : detailsFor("printed", option, PRINT_HINT)
);

const VIDEOS = ["promoVideo", "recapVideo", "reel", "longFormVideo"];
const digitalDetails = DIGITAL.filter(
  (option) => VIDEOS.includes(option.value) || option.value === "other"
).map((option) =>
  option.value === "other"
    ? detailsFor("digital", option, "What it is and what to include.", "Other digital design: details")
    : detailsFor("digital", option, VIDEO_HINT)
);

/**
 * The event's Marketing form: the old web app's, plus what design requests
 * have added since (Reels, long form video, the key Bible passage and
 * multiple drafts). Design requests are for everything that isn't an event.
 */
export const MARKETING_FIELDS: FormField[] = [
  {
    key: "keyMessage",
    kind: "longText",
    label: "What is the key message you would like to send out, or for us to reflect?",
    shortLabel: "Key message",
    required: true,
    section: "Design",
    inSummary: true,
  },
  {
    key: "visualStyle",
    kind: "longText",
    label: "Is there a theme, colour palette or visual style you'd like us to work with?",
    shortLabel: "Theme / visual style",
    hint: "Share examples or links, or write n/a if you'd like the design team to decide.",
    required: true,
  },
  {
    key: "biblePassage",
    kind: "text",
    label: "What is the key Bible passage for the event?",
    shortLabel: "Key Bible passage",
    placeholder: "e.g. Isaiah 6:8",
    required: false,
    maxLength: 200,
  },
  {
    key: "printed",
    kind: "checkboxes",
    label: "Printed: what would you like us to design?",
    shortLabel: "Printed designs",
    required: false,
    section: "What would you like us to design?",
    options: PRINTED,
    inSummary: true,
  },
  ...printedDetails,
  {
    key: "digital",
    kind: "checkboxes",
    label: "Digital: what would you like us to design?",
    shortLabel: "Digital designs",
    required: false,
    options: DIGITAL,
    inSummary: true,
  },
  ...digitalDetails,
  {
    key: "multipleDrafts",
    kind: "yesNo",
    label: "Would you like multiple demos or drafts before the final design?",
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
    key: "promotion",
    kind: "checkboxes",
    label: "What promotion do you need, including on the day?",
    shortLabel: "Promotion",
    required: false,
    section: "Promotion",
    options: PROMOTION,
    inSummary: true,
  },
  detailsFor("promotion", PROMOTION[PROMOTION.length - 1], "What else you need.", "Other promotion: details"),
  {
    key: "promoStart",
    kind: "date",
    label: "When would you like promotion to start?",
    shortLabel: "Promotion starts",
    required: false,
  },
  {
    key: "postInfo",
    kind: "longText",
    label: "Please give all the important information you want us to include in posts",
    shortLabel: "Information for posts",
    hint: "For visual posts (what text to show on the post) or captions.",
    required: false,
  },
  {
    key: "otherInfo",
    kind: "longText",
    label: "Do you have any other information you would like to include?",
    shortLabel: "Other information",
    required: false,
  },
];

/** The event and Marketing questions, for the app to render. */
export const fields = query({
  args: {},
  handler: async (ctx) => {
    if (!(await optionalProfile(ctx))) return null;
    return { event: EVENT_FIELDS, marketing: MARKETING_FIELDS };
  },
});
