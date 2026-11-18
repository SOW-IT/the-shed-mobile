import { andList } from "@shared/grievances";
import { GuideSheet } from "@/components/ui/GuideSheet";

// What happens after "Raise a Grievance", from the ⓘ beside it.
export const GrievanceGuideSheet = ({
  visible,
  onClose,
  departments,
}: {
  visible: boolean;
  onClose: () => void;
  departments: string[];
}) => (
  <GuideSheet
    visible={visible}
    onClose={onClose}
    title="How raising a grievance works"
    steps={[
      {
        icon: "create-outline",
        title: "Fill in the form",
        detail:
          "Your name and email, what it's about and what happened, in your own words. When it happened, who was involved and what you'd like to happen are optional. You don't have to be signed in.",
      },
      {
        icon: "lock-closed-outline",
        title: "Only the grievance team sees it",
        detail: `It goes to ${departments.length > 0 ? andList(departments) : "SOW's grievance team"}, and nobody else: not your Head or your department.`,
      },
      {
        icon: "mail-outline",
        title: "You get a copy",
        detail: "An email confirms it arrived, with a copy of what you sent.",
      },
      {
        icon: "person-outline",
        title: "Someone looks after it",
        detail:
          "A member of the team takes it on and it shows as In progress. You're emailed who it is, and again if it's handed to someone else. Reply to those emails to talk with them.",
      },
      {
        icon: "checkmark-circle-outline",
        title: "It's closed with a note",
        detail:
          "When it's Resolved you're emailed the outcome, or if it's Not proceeding, the reason. Reply if you'd like to talk about it.",
      },
      {
        icon: "eye-outline",
        title: "Following along",
        detail:
          "Signed in, it's under Mine with each step and when it happened. If you weren't signed in, updates come by email.",
      },
      {
        icon: "warning-outline",
        title: "If someone is in danger",
        detail: "Call 000 first. A grievance isn't for emergencies.",
      },
    ]}
  />
);
