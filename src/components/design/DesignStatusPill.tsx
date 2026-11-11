import {
  DESIGN_STATUS_LABELS,
  type DesignRequestStatus,
} from "@shared/designRequests";
import { StatusPill, toneColour, type Tone } from "@/components/ui/StatusPill";
import type { AppTheme } from "@/theme";

const DESIGN_TONES: Record<DesignRequestStatus, Tone> = {
  PENDING: "waiting",
  APPROVED: "info",
  COMPLETED: "done",
  DECLINED: "problem",
  CANCELLED: "quiet",
};

// A design request card is outlined in its status pill's colour.
export const designStatusColour = (t: AppTheme, status: DesignRequestStatus) =>
  toneColour(t, DESIGN_TONES[status]);

export const DesignStatusPill = ({ status }: { status: DesignRequestStatus }) => (
  <StatusPill label={DESIGN_STATUS_LABELS[status]} tone={DESIGN_TONES[status]} />
);
