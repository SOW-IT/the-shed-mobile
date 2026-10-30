import { useConvexAuth, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { type GrievanceStatus } from "@shared/grievances";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { GrievanceRow } from "@/components/grievances/GrievanceRow";
import {
  Card,
  EmptyState,
  FadeInView,
  FooterAction,
  LoadingState,
  Muted,
  ReadableColumn,
  Screen,
  SectionTitle,
  stagger,
  Txt,
} from "@/components/ui";
import { spacing, typography } from "@/theme";

type Group = { title: string; statuses: GrievanceStatus[] };

const MINE_GROUPS: Group[] = [
  { title: "Open", statuses: ["SUBMITTED", "RECEIVED", "IN_PROGRESS"] },
  { title: "Closed", statuses: ["RESOLVED", "NOT_PROCEEDING"] },
];

const QUEUE_GROUPS: Group[] = [
  { title: "Waiting for someone to take it", statuses: ["SUBMITTED"] },
  { title: "Received", statuses: ["RECEIVED"] },
  { title: "In progress", statuses: ["IN_PROGRESS"] },
];

const ALL_GROUPS: Group[] = [...QUEUE_GROUPS, ...MINE_GROUPS.slice(1)];

// convex/grievances.ts `all` returns at most this many.
const ALL_LIMIT = 300;

const INTRO =
  "Raise a grievance with SOW's People and Culture and Compliance teams. Only they can see it, and you'll get an email each time it moves along.";

const About = ({ signedIn }: { signedIn: boolean }) => (
  <Card>
    <Txt style={typography.headline}>Confidential</Txt>
    <Muted>{INTRO}</Muted>
    {signedIn ? null : (
      <Muted>Sign in to follow your grievances here too. Without signing in, updates come by email.</Muted>
    )}
  </Card>
);

const GrievanceList = ({
  rows,
  groups,
  forTeam,
  header,
  empty,
}: {
  rows: Doc<"grievances">[] | null | undefined;
  groups: Group[];
  forTeam: boolean;
  header?: React.ReactNode;
  empty: { title: string; message: string };
}) => {
  const router = useRouter();
  let index = 0;
  return (
    <ReadableColumn>
      <View style={{ gap: spacing.sm }}>
        {header}
        {rows === undefined ? <LoadingState /> : null}
        {rows !== undefined && (rows === null || rows.length === 0) ? (
          <EmptyState icon="shield-checkmark-outline" title={empty.title} message={empty.message} />
        ) : null}
        {groups.map((group) => {
          const inGroup = (rows ?? []).filter((g) => group.statuses.includes(g.status));
          if (inGroup.length === 0) return null;
          return (
            <View key={group.title} style={{ gap: spacing.sm }}>
              <SectionTitle>
                {group.title} · {inGroup.length}
              </SectionTitle>
              {inGroup.map((grievance) => (
                <FadeInView key={grievance._id} delay={stagger(index++)}>
                  <GrievanceRow
                    grievance={grievance}
                    forTeam={forTeam}
                    onPress={() => router.push(`/grievances/${grievance._id}`)}
                  />
                </FadeInView>
              ))}
            </View>
          );
        })}
      </View>
    </ReadableColumn>
  );
};

export default function GrievancesScreen() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.grievances.viewer, isAuthenticated ? {} : "skip");
  const team = !!viewer?.isHandler;
  const mine = useQuery(api.grievances.mine, isAuthenticated ? {} : "skip");
  const queue = useQuery(api.grievances.queue, team ? {} : "skip");
  const all = useQuery(api.grievances.all, team ? {} : "skip");
  const waitingRaw = useQuery(api.grievances.waitingOnMe, team ? {} : "skip");
  const waiting = waitingRaw ?? 0;

  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab]);
  const landingKnown =
    !isAuthenticated ||
    (viewer !== undefined && mine !== undefined && (!team || waitingRaw !== undefined));
  const landing = team && waiting > 0 && (mine ?? []).length === 0 ? "queue" : "mine";
  useEffect(() => {
    if (active !== null || !landingKnown || typeof tab === "string") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(landing);
  }, [active, landing, landingKnown, tab]);
  const wanted = active ?? landing;

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
            forTeam={false}
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
            key: "queue",
            label: "Open",
            badge: waiting > 0 ? waiting : undefined,
            render: () => (
              <GrievanceList
                rows={queue}
                groups={QUEUE_GROUPS}
                forTeam
                empty={{ title: "All caught up", message: "Open grievances show up here." }}
              />
            ),
          },
          {
            key: "all",
            label: "All",
            render: () => (
              <GrievanceList
                rows={all}
                groups={ALL_GROUPS}
                forTeam
                empty={{ title: "Nothing here", message: "No grievances have been raised yet." }}
                header={
                  (all?.length ?? 0) >= ALL_LIMIT ? (
                    <Muted>{`Showing the newest ${ALL_LIMIT}. Older ones are still kept.`}</Muted>
                  ) : undefined
                }
              />
            ),
          },
        ]
      : []),
  ];
  const activeKey = tabs.some((t) => t.key === wanted) ? wanted : "mine";

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={activeKey}
      onActiveKeyChange={setActive}
      fullWidth
      footer={
        <FooterAction title="+ Raise a Grievance" onPress={() => router.push("/grievances/new")} />
      }
      footerTabKey="mine"
    />
  );
}
