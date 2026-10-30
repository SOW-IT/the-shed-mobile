import { useConvexAuth, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import { andList, type GrievanceStatus } from "@shared/grievances";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { GrievanceOptionsSheet } from "@/components/grievances/GrievanceOptionsSheet";
import { GrievanceRow, type GrievanceListRow } from "@/components/grievances/GrievanceRow";
import {
  Btn,
  Card,
  EmptyState,
  FadeInView,
  FloatingYearPicker,
  FooterAction,
  LoadingState,
  Muted,
  ReadableColumn,
  Row,
  Screen,
  SectionTitle,
  stagger,
  Txt,
} from "@/components/ui";
import { spacing, typography } from "@/theme";

type Group = { title: string; statuses: GrievanceStatus[] };

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
  const years = useQuery(api.grievances.years, team ? {} : "skip");
  const [pickedYear, setPickedYear] = useState<number | null>(null);
  const year = pickedYear ?? years?.[0] ?? null;
  const submitted = useQuery(api.grievances.submitted, team && year ? { year } : "skip");
  const settings = useQuery(api.grievances.settings, team ? {} : "skip");
  const waitingRaw = useQuery(api.grievances.waitingOnMe, team ? {} : "skip");
  const waiting = waitingRaw ?? 0;
  const [editingOptions, setEditingOptions] = useState(false);

  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab]);
  const landingKnown =
    !isAuthenticated ||
    (viewer !== undefined && mine !== undefined && (!team || waitingRaw !== undefined));
  const landing = team && waiting > 0 && (mine ?? []).length === 0 ? "submitted" : "mine";
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
