import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type DesignRequestStatus } from "@shared/designRequests";
import { ChromeScreen } from "@/components/ChromeScreen";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  DesignRequestRow,
  type DesignRequestListRow,
} from "@/components/design/DesignRequestRow";
import {
  Card,
  EmptyState,
  FadeInView,
  FloatingYearPicker,
  FooterAction,
  LoadingState,
  Muted,
  ReadableColumn,
  Screen,
  SectionTitle,
  stagger,
  Txt,
  YearPill,
} from "@/components/ui";
import { spacing } from "@/theme";

type Group = { title: string; statuses: DesignRequestStatus[] };

const MINE_GROUPS: Group[] = [
  { title: "Open", statuses: ["PENDING", "APPROVED"] },
  { title: "Closed", statuses: ["COMPLETED", "DECLINED", "CANCELLED"] },
];

const QUEUE_GROUPS: Group[] = [
  { title: "To approve", statuses: ["PENDING"] },
  { title: "Approved, to do", statuses: ["APPROVED"] },
];

const ARCHIVE_GROUPS: Group[] = [
  ...QUEUE_GROUPS,
  { title: "Done", statuses: ["COMPLETED"] },
  { title: "Declined or cancelled", statuses: ["DECLINED", "CANCELLED"] },
];

const RequestList = ({
  rows,
  groups,
  showRequester,
  unread,
  empty,
  header,
}: {
  rows: DesignRequestListRow[] | null | undefined;
  groups: Group[];
  showRequester: boolean;
  unread: Record<string, number>;
  empty: { title: string; message: string };
  header?: ReactNode;
}) => {
  const router = useRouter();
  let index = 0;
  return (
    <ReadableColumn>
      <View style={{ gap: spacing.sm }}>
        {header}
        {rows === undefined ? <LoadingState /> : null}
        {rows !== undefined && (rows === null || rows.length === 0) ? (
          <EmptyState icon="color-palette-outline" title={empty.title} message={empty.message} />
        ) : null}
        {groups.map((group) => {
          const inGroup = (rows ?? []).filter((r) => group.statuses.includes(r.status));
          if (inGroup.length === 0) return null;
          return (
            <View key={group.title} style={{ gap: spacing.sm }}>
              <SectionTitle>
                {group.title} · {inGroup.length}
              </SectionTitle>
              {inGroup.map((request) => (
                <FadeInView key={request._id} delay={stagger(index++)}>
                  <DesignRequestRow
                    request={request}
                    showRequester={showRequester}
                    unread={unread[request._id] ?? 0}
                    onPress={() => router.push(`/design-requests/${request._id}`)}
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

/**
 * Design Requests: your own (Mine); for the Marketing team and admins, the
 * open requests to approve or finish (Marketing) and every request by staff
 * year (All), like Reimbursements' All tab.
 */
export default function DesignRequestsScreen() {
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile;
  const viewer = useQuery(api.designRequests.viewer, staff ? {} : "skip");
  const years = useQuery(api.designRequests.years, staff ? {} : "skip");
  const [mineYear, setMineYear] = useState<number | null>(null);
  const [archiveYear, setArchiveYear] = useState<number | null>(null);
  const team = !!viewer?.canSeeQueue;
  const mine = useQuery(
    api.designRequests.mine,
    staff ? (mineYear === null ? {} : { year: mineYear }) : "skip"
  );
  const queue = useQuery(api.designRequests.queue, team ? {} : "skip");
  const shownArchiveYear = archiveYear ?? me?.year;
  const archive = useQuery(
    api.designRequests.archive,
    team && shownArchiveYear !== undefined ? { year: shownArchiveYear } : "skip"
  );
  const ids = [
    ...new Set([...(mine ?? []), ...(queue ?? []), ...(archive ?? [])].map((r) => r._id)),
  ] as Id<"designRequests">[];
  const unread =
    useQuery(api.designRequestComments.unreadCounts, ids.length > 0 ? { ids } : "skip") ??
    {};

  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState("mine");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab]);

  if (me === undefined) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (me === null) return <Redirect href="/home" />;
  if (me.profile === null) {
    return (
      <ChromeScreen>
        <Card>
          <Txt style={{ fontSize: 18, fontWeight: "700" }}>Design Requests</Txt>
          <Muted>
            Design requests are for SOW staff. No role or department is assigned to{" "}
            {me.email} for {me.year} yet.
          </Muted>
        </Card>
      </ChromeScreen>
    );
  }

  const unreadIn = (rows: DesignRequestListRow[] | null | undefined) =>
    (rows ?? []).reduce((sum, r) => sum + (unread[r._id] ?? 0), 0);
  const waitingOnMe = (queue ?? []).filter((r) =>
    viewer?.isMarketingHead ? r.status === "PENDING" : r.status === "APPROVED"
  ).length;
  const badge = (count: number) => (count > 0 ? count : undefined);

  const mineYears = years?.mine ?? [];
  const tabs: PagerTab[] = [
    {
      key: "mine",
      label: "Mine",
      messageBadge: badge(unreadIn(mine)),
      render: () => (
        <RequestList
          rows={mine}
          groups={MINE_GROUPS}
          showRequester={false}
          unread={unread}
          header={
            // The footer button sits where the floating picker would, so
            // Mine's year picker lives at the top of the list.
            mineYears.length > 1 ? (
              <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                <YearPill
                  year={mineYear ?? me.year}
                  years={mineYears}
                  onSelect={(y) => setMineYear(y === me.year ? null : y)}
                />
              </View>
            ) : null
          }
          empty={{
            title: "No design requests",
            message:
              mineYear === null
                ? "Ask the Marketing team to design something for a project. For an event, make an Event Request instead."
                : `You made no design requests in ${mineYear}.`,
          }}
        />
      ),
    },
    ...(team
      ? [
          {
            key: "queue",
            label: "Marketing",
            badge: badge(waitingOnMe),
            messageBadge: badge(unreadIn(queue)),
            render: () => (
              <RequestList
                rows={queue}
                groups={QUEUE_GROUPS}
                showRequester
                unread={unread}
                empty={{
                  title: "All caught up",
                  message: "Requests waiting for approval or to be finished show up here.",
                }}
              />
            ),
          },
          {
            key: "all",
            label: "All",
            messageBadge: badge(unreadIn(archive)),
            render: () => (
              <RequestList
                rows={archive}
                groups={ARCHIVE_GROUPS}
                showRequester
                unread={unread}
                empty={{
                  title: "Nothing here",
                  message: `There were no design requests in ${shownArchiveYear}.`,
                }}
              />
            ),
          },
        ]
      : []),
  ];
  const activeKey = tabs.some((t) => t.key === active) ? active : "mine";
  const noHead = viewer !== undefined && viewer !== null && !viewer.hasMarketingHead;
  const archiveYears = years?.all ?? [];

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={activeKey}
      onActiveKeyChange={setActive}
      fullWidth
      footer={
        <FooterAction
          title="+ New Design Request"
          disabled={noHead}
          note={
            noHead
              ? `There's no Marketing Head for ${me.year} yet, so design requests can't be submitted. Ask an admin to set one.`
              : null
          }
          onPress={() => router.push("/design-requests/new")}
        />
      }
      footerTabKey="mine"
      floating={
        activeKey === "all" && archiveYears.length > 1 ? (
          <FloatingYearPicker
            year={shownArchiveYear ?? me.year}
            years={archiveYears}
            onSelect={(y) => setArchiveYear(y === me.year ? null : y)}
          />
        ) : undefined
      }
    />
  );
}
