import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { ReactNode, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { andList, type GrievanceStatus } from "@shared/grievances";
import { GroupedList, type StatusGroup } from "@/components/GroupedList";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { staffYearForDate } from "@shared/flow";
import { GrievanceTeamCard } from "@/components/grievances/GrievanceTeamCard";
import {
  GrievanceOptionsSheet,
} from "@/components/grievances/GrievanceOptionsSheet";
import {
  GrievanceRow,
  type GrievanceListRow,
} from "@/components/grievances/GrievanceRow";
import {
  Btn,
  Card,
  FloatingYearPicker,
  FooterAction,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
  Txt,
  WarningBanner,
} from "@/components/ui";
import { useLandingTab } from "@/hooks/useLandingTab";
import { spacing, typography } from "@/theme";

type Group = StatusGroup<GrievanceStatus>;

const MINE_GROUPS: Group[] = [
  { title: "Open", statuses: ["SUBMITTED", "IN_PROGRESS"] },
  { title: "Closed", statuses: ["RESOLVED", "NOT_PROCEEDING"] },
];

const SUBMITTED_GROUPS: Group[] = [
  { title: "Waiting for someone to take it on", statuses: ["SUBMITTED"] },
  { title: "In progress", statuses: ["IN_PROGRESS"] },
  { title: "Resolved", statuses: ["RESOLVED"] },
  { title: "Not proceeding", statuses: ["NOT_PROCEEDING"] },
];

// convex/grievances.ts lists at most this many a year.
const YEAR_LIMIT = 500;

const About = ({ signedIn }: { signedIn: boolean }) => {
  const departments = useQuery(api.grievances.settings)?.departments ?? [];
  return (
    <Card>
      <Txt style={typography.headline}>Confidential</Txt>
      <Muted>
        {`Raise a grievance with SOW's grievance team (${andList(departments)}). Only they can see it, and you'll get an email each time it moves along.`}
      </Muted>
      {signedIn ? null : (
        <Muted>
          Sign in to follow your grievances here too. Without signing in, updates come by email.
        </Muted>
      )}
    </Card>
  );
};

const GrievanceList = ({
  rows,
  groups,
  header,
  empty,
}: {
  rows: GrievanceListRow[] | null | undefined;
  groups: Group[];
  header?: ReactNode;
  empty: { title: string; message: string };
}) => {
  const router = useRouter();
  return (
    <GroupedList
      rows={rows}
      groups={groups}
      icon="shield-checkmark-outline"
      empty={empty}
      header={header}
      renderRow={(grievance) => (
        <GrievanceRow
          grievance={grievance}
          onPress={() => router.push(`/grievances/${grievance._id}`)}
        />
      )}
    />
  );
};

export default function GrievancesScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.grievances.viewer, isAuthenticated ? {} : "skip");
  const team = !!viewer?.isHandler;
  const mine = useQuery(api.grievances.mine, isAuthenticated ? {} : "skip");
  const years = useQuery(api.grievances.years, team ? {} : "skip");
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const year = pickedYear ?? years?.[0] ?? null;
  const submitted = useQuery(api.grievances.submitted, team && year ? { year } : "skip");
  const settings = useQuery(api.grievances.settings, team ? {} : "skip");
  const waitingRaw = useQuery(api.grievances.waitingOnMe, team ? {} : "skip");
  const waiting = waitingRaw ?? 0;
  const [editingOptions, setEditingOptions] = useState(false);

  const landingKnown =
    !isAuthenticated ||
    (viewer !== undefined && mine !== undefined && (!team || waitingRaw !== undefined));
  const landing = team && waiting > 0 && (mine ?? []).length === 0 ? "submitted" : "mine";
  const [picked, setActive] = useLandingTab(landingKnown ? landing : null);
  const wanted = picked ?? landing;

  if (!landingKnown) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const tabs: PagerTab[] = [
    {
      key: "mine",
      label: isAuthenticated ? "Mine" : "Grievances",
      render: () =>
        isAuthenticated ? (
          <GrievanceList
            rows={mine}
            groups={MINE_GROUPS}
            header={<About signedIn />}
            empty={{
              title: "No grievances",
              message: "Grievances you raise while signed in show up here with their progress.",
            }}
          />
        ) : (
          <ReadableColumn>
            <About signedIn={false} />
          </ReadableColumn>
        ),
    },
    ...(team
      ? [
          {
            key: "submitted",
            label: "Submitted",
            badge: waiting > 0 ? waiting : undefined,
            render: () => (
              <GrievanceList
                rows={submitted}
                groups={SUBMITTED_GROUPS}
                header={
                  <View style={{ gap: spacing.sm }}>
                    {viewer?.handover ? (
                      <WarningBanner
                        message={`Your grievance role was last year's, so this access ends on 31 December. ${
                          viewer.handover.open === 0
                            ? "You aren't looking after any open grievances."
                            : `Give the ${viewer.handover.open === 1 ? "one" : viewer.handover.open} you're looking after to someone on this year's team, or resolve ${viewer.handover.open === 1 ? "it" : "them"}, before then.`
                        }`}
                      />
                    ) : null}
                    <Row>
                      <Btn
                        title="Edit Form Options"
                        variant="tonal"
                        icon="list-outline"
                        disabled={!settings}
                        onPress={() => setEditingOptions(true)}
                      />
                    </Row>
                    {(submitted?.length ?? 0) >= YEAR_LIMIT ? (
                      <Muted>{`Showing the first ${YEAR_LIMIT} this year.`}</Muted>
                    ) : null}
                  </View>
                }
                empty={{
                  title: "Nothing here",
                  message: `No grievances in ${year ?? "this year"}. Open ones from earlier years move here on 1 October.`,
                }}
              />
            ),
          },
          {
            key: "settings",
            label: "Settings",
            render: () => (
              <ReadableColumn>
                <GrievanceTeamCard year={staffYearForDate(new Date())} />
              </ReadableColumn>
            ),
          },
        ]
      : []),
  ];
  const activeKey = tabs.some((t) => t.key === wanted) ? wanted : "mine";

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={activeKey}
        onActiveKeyChange={setActive}
        fullWidth
        footer={
          <FooterAction title="+ Raise a Grievance" onPress={() => router.push("/grievances/new")} />
        }
        footerTabKey="mine"
        floatingAboveFooter
        floating={
          activeKey === "submitted" && year && years && years.length > 1 ? (
            <FloatingYearPicker year={year} years={years} onSelect={setPickedYear} />
          ) : undefined
        }
      />
      {settings ? (
        <GrievanceOptionsSheet
          visible={editingOptions}
          categories={settings.categories}
          onClose={() => setEditingOptions(false)}
        />
      ) : null}
    </>
  );
}
