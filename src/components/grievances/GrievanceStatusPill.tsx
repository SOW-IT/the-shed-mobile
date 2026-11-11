import { GRIEVANCE_STATUS_LABELS, type GrievanceStatus } from "@shared/grievances";
import { StatusPill, type Tone } from "@/components/ui/StatusPill";

const GRIEVANCE_TONES: Record<GrievanceStatus, Tone> = {
  SUBMITTED: "waiting",
  IN_PROGRESS: "info",
  RESOLVED: "done",
  NOT_PROCEEDING: "quiet",
};

export const GrievanceStatusPill = ({ status }: { status: GrievanceStatus }) => (
  <StatusPill label={GRIEVANCE_STATUS_LABELS[status]} tone={GRIEVANCE_TONES[status]} />
);
