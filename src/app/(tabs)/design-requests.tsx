import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { type DesignRequestStatus } from "@shared/designRequests";
import { ChromeScreen } from "@/components/ChromeScreen";
import { EarlierYears, useEarlierYears } from "@/components/EarlierYears";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  DesignRequestRow,
  type DesignRequestListRow,
} from "@/components/design/DesignRequestRow";
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
import { staffOnlyMessage } from "@shared/staffOnly";

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

const yearOfRequest = (row: DesignRequestListRow) => row.year;
const submittedAtOf = (row: DesignRequestListRow) => row.submittedAt;

const RequestList = ({
  rows,
  groups,
  showRequester,
  unread,
  empty,
  footer,
}: {
  rows: DesignRequestListRow[] | null | undefined;
  groups: Group[];
  showRequester: boolean;
  unread: Record<string, number>;
  empty: { title: string; message: string; action?: { label: string; onPress: () => void } };
  footer?: ReactNode;
}) => {
  const router = useRouter();
  let index = 0;
  return (
    <ReadableColumn>
      <View style={{ gap: spacing.sm }}>
        {rows === undefined ? <LoadingState /> : null}
        {rows !== undefined && (rows === null || rows.length === 0) ? (
          <EmptyState
            icon="color-palette-outline"
            title={empty.title}
            message={empty.message}
            action={empty.action}
          />
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
        {footer}
      </View>
    </ReadableColumn>
  );
};

const EarlierRequests = ({
  history,
  showRequester,
  unread,
}: {
  history: ReturnType<typeof useEarlierYears<DesignRequestListRow>>;
  showRequester: boolean;
  unread: Record<string, number>;
}) => {
  const router = useRouter();
  return (
    <EarlierYears
      groups={history.groups}
      hasMore={history.hasMore}
      loadingMore={history.loadingMore}
      onLoadMore={history.loadMore}
      renderRows={(rows) =>
        rows.map((request) => (
          <DesignRequestRow
            key={request._id}
            request={request}
            showRequester={showRequester}
            unread={unread[request._id] ?? 0}
            onPress={() => router.push(`/design-requests/${request._id}`)}
          />
        ))
      }
    />
  );
};

export default function DesignRequestsScreen() {
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile;
  const viewer = useQuery(api.designRequests.viewer, staff ? {} : "skip");
  const team = !!viewer?.canSeeQueue;
  const mine = useQuery(api.designRequests.mine, staff ? {} : "skip");
  const queue = useQuery(api.designRequests.queue, team ? {} : "skip");
  const waitingOnMeRaw = useQuery(api.designRequests.waitingOnMe, team ? {} : "skip");
  const waitingOnMe = waitingOnMeRaw ?? 0;
  const archive = useQuery(
    api.designRequests.archive,
    team && me ? { year: me.year } : "skip"
  );
  const mineLoadMoreRef = useRef<(() => void) | null>(null);
  const archiveLoadMoreRef = useRef<(() => void) | null>(null);
  const earlierMine = useEarlierYears(api.designRequests.earlierMine, {
    enabled: mine != null,
    exclude: (mine ?? []).map((r) => r._id),
    yearOf: yearOfRequest,
    newestOf: submittedAtOf,
    loadMoreRef: mineLoadMoreRef,
  });
  const earlierArchive = useEarlierYears(api.designRequests.earlierArchive, {
    enabled: archive != null,
    exclude: (archive ?? []).map((r) => r._id),
    yearOf: yearOfRequest,
    newestOf: submittedAtOf,
    loadMoreRef: archiveLoadMoreRef,
  });
  const earlierRows = [...earlierMine.groups, ...earlierArchive.groups].flatMap((g) => g.rows);
  const ids = [
    ...new Set(
      [...(mine ?? []), ...(queue ?? []), ...(archive ?? []), ...earlierRows].map((r) => r._id)
    ),
  ] as Id<"designRequests">[];
  const unread =
    useQuery(api.designRequestComments.unreadCounts, ids.length > 0 ? { ids } : "skip") ??
    {};

  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab]);
  const landingKnown =
    mine !== undefined && viewer !== undefined && (!team || waitingOnMeRaw !== undefined);
  const landing = landingKnown
    ? waitingOnMe > 0 && (mine ?? []).length === 0
      ? "queue"
      : "mine"
    : null;
  useEffect(() => {
    if (active !== null || landing === null || typeof tab === "string") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(landing);
  }, [active, landing, tab]);
  const wanted = active ?? landing;

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
          <Txt style={typography.section}>Design Requests</Txt>
          <Muted>{staffOnlyMessage("Design", me)}</Muted>
        </Card>
      </ChromeScreen>
    );
  }
  if (wanted === null) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  const unreadIn = (rows: DesignRequestListRow[] | null | undefined) =>
    (rows ?? []).reduce((sum, r) => sum + (unread[r._id] ?? 0), 0);
  const badge = (count: number) => (count > 0 ? count : undefined);


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
          footer={<EarlierRequests history={earlierMine} showRequester={false} unread={unread} />}
          empty={{
            title: earlierMine.groups.length > 0 ? "Nothing this year yet" : "No design requests",
            message:
              "Ask the Marketing team to design something for a project. For an event, make an Event Request instead.",
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
                footer={<EarlierRequests history={earlierArchive} showRequester unread={unread} />}
                empty={{
                  title: "Nothing here",
                  message: `No design requests yet in ${me.year}.`,
                }}
              />
            ),
          },
        ]
      : []),
  ];
  const activeKey = tabs.some((t) => t.key === wanted) ? wanted : "mine";
  const noHead = viewer !== undefined && viewer !== null && !viewer.hasMarketingHead;

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
      onEndReached={(key) => {
        if (key === "mine") mineLoadMoreRef.current?.();
        if (key === "all") archiveLoadMoreRef.current?.();
      }}
    />
  );
}
