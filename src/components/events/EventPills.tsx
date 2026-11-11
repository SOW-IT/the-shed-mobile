import {
  EVENT_STATUS_LABELS,
  SUB_FORM_STATUS_LABELS,
  type EventRequestStatus,
  type RiskRating,
  type SubFormStatus,
} from "@shared/eventRequests";
import { StatusPill, toneColour, type Tone } from "@/components/ui/StatusPill";
import type { AppTheme } from "@/theme";

const EVENT_TONES: Record<EventRequestStatus, Tone> = {
  IN_PROGRESS: "waiting",
  APPROVED: "done",
  CANCELLED: "quiet",
};

export const SUB_FORM_TONES: Record<SubFormStatus, Tone> = {
  DRAFT: "quiet",
  PENDING: "waiting",
  CHANGES_REQUESTED: "problem",
  APPROVED: "done",
  NOT_REQUIRED: "info",
};

const RATING_TONES: Record<RiskRating, Tone> = {
  Low: "done",
  Moderate: "info",
  High: "waiting",
  "Very High": "problem",
  Extreme: "problem",
};

// An event request card is outlined in its status pill's colour.
export const eventStatusColour = (t: AppTheme, status: EventRequestStatus) =>
  toneColour(t, EVENT_TONES[status]);

export const EventStatusPill = ({ status }: { status: EventRequestStatus }) => (
  <StatusPill label={EVENT_STATUS_LABELS[status]} tone={EVENT_TONES[status]} />
);

export const SubFormStatusPill = ({ status }: { status: SubFormStatus }) => (
  <StatusPill label={SUB_FORM_STATUS_LABELS[status]} tone={SUB_FORM_TONES[status]} />
);

export const RiskRatingPill = ({ score, rating }: { score?: number; rating: RiskRating }) => (
  <StatusPill label={score === undefined ? rating : `${score} · ${rating}`} tone={RATING_TONES[rating]} />
);
