import { useQuery } from "convex/react";
import { Redirect, useRouter } from "expo-router";
import { ReactNode, useRef } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EventRequestStatus } from "@shared/eventRequests";
import { ChromeScreen } from "@/components/ChromeScreen";
import { FinanceSettingsButton } from "@/components/finance/FinanceSettings";
import { useEarlierYears } from "@/components/EarlierYears";
import {
  EarlierRows,
  GroupedList,
  type StatusGroup,
} from "@/components/GroupedList";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  EventRequestRow,
  type EventRequestListRow,
} from "@/components/events/EventRequestRow";
import { EVENT_REQUEST_ICON } from "@/components/events/eventRequestIcon";
import {
  Card,
  FooterAction,
  LoadingState,
  Muted,
  Screen,
  Txt,
} from "@/components/ui";
import { useLandingTab } from "@/hooks/useLandingTab";
import { typography } from "@/theme";
import { staffOnlyMessage } from "@shared/staffOnly";

type Group = StatusGroup<EventRequestStatus>;

const GROUPS: Group[] = [
  { title: "In progress", statuses: ["IN_PROGRESS"] },
  { title: "Approved", statuses: ["APPROVED"] },
  { title: "Cancelled", statuses: ["CANCELLED"] },
];

type Unread = Record<string, Partial<Record<string, number>>>;
const unreadFor = (unread: Unread, id: string) =>
  Object.values(unread[id] ?? {}).reduce<number>((sum, n) => sum + (n ?? 0), 0);

const yearOfEvent = (row: EventRequestListRow) => row.year;
const startOfEvent = (row: EventRequestListRow) => Date.parse(row.startsAt) || row.submittedAt;

const EventList = ({
  rows,
  groups = GROUPS,
  unread,
  empty,
  header,
  footer,
}: {
  rows: EventRequestListRow[] | null | undefined;
  groups?: Group[];
  unread: Unread;
  empty: { title: string; message: string; action?: { label: string; onPress: () => void } };
  header?: ReactNode;
  footer?: ReactNode;
}) => (
  <GroupedList
    rows={rows}
    groups={groups}
    icon={EVENT_REQUEST_ICON.outline}
    empty={empty}
    header={header}
    footer={footer}
    renderRow={(event) => <EventRow event={event} unread={unread} />}
  />
);

const EventRow = ({ event, unread }: { event: EventRequestListRow; unread: Unread }) => {
  const router = useRouter();
  return (
    <EventRequestRow
      event={event}
      unread={unreadFor(unread, event._id)}
      onPress={() => router.push(`/event-requests/${event._id}`)}
    />
  );
};

const EarlierEvents = ({
  history,
  unread,
}: {
  history: ReturnType<typeof useEarlierYears<EventRequestListRow>>;
  unread: Unread;
}) => <EarlierRows history={history} renderRow={(event) => <EventRow event={event} unread={unread} />} />;

export default function EventRequestsScreen() {
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile && !me.isCampusLeader;
  const viewer = useQuery(api.eventRequests.viewer, staff ? {} : "skip");
  const mine = useQuery(api.eventRequests.mine, staff ? {} : "skip");
  const review = useQuery(api.eventRequests.review, viewer?.reviews ? {} : "skip");
  const all = useQuery(
    api.eventRequests.all,
    viewer?.seesAll && me ? { year: me.year } : "skip"
  );
  const mineLoadMoreRef = useRef<(() => void) | null>(null);
  const allLoadMoreRef = useRef<(() => void) | null>(null);
  const earlierMine = useEarlierYears(api.eventRequests.earlierMine, {
    enabled: mine != null,
    exclude: (mine ?? []).map((r) => r._id),
    yearOf: yearOfEvent,
    newestOf: startOfEvent,
    loadMoreRef: mineLoadMoreRef,
  });
  const earlierAll = useEarlierYears(api.eventRequests.earlierAll, {
    enabled: all != null,
    exclude: (all ?? []).map((r) => r._id),
    yearOf: yearOfEvent,
    newestOf: startOfEvent,
    loadMoreRef: allLoadMoreRef,
  });
  const earlierRows = [...earlierMine.groups, ...earlierAll.groups].flatMap((g) => g.rows);
  const ids = [
    ...new Set(
      [...(mine ?? []), ...(review ?? []), ...(all ?? []), ...earlierRows].map((r) => r._id)
    ),
  ] as Id<"eventRequests">[];
  const unread =
    useQuery(api.eventRequestComments.unreadCounts, ids.length > 0 ? { ids } : "skip") ?? {};

  const [active, setActive] = useLandingTab("mine");

  if (me === undefined) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (me === null) return <Redirect href="/home" />;
  if (!staff) {
    return (
      <ChromeScreen>
        <Card>
          <Txt style={typography.section}>Event Requests</Txt>
          <Muted>{staffOnlyMessage("Event", me)}</Muted>
        </Card>
      </ChromeScreen>
    );
  }

  const unreadIn = (rows: EventRequestListRow[] | null | undefined) =>
    (rows ?? []).reduce((sum, r) => sum + unreadFor(unread, r._id), 0);
  const waitingOnMe = (review ?? []).reduce((n, r) => n + (r.waitingOnMe?.length ?? 0), 0);
  const badge = (count: number) => (count > 0 ? count : undefined);

  const tabs: PagerTab[] = [
    {
      key: "mine",
      label: "Mine",
      messageBadge: badge(unreadIn(mine)),
      render: () => (
        <EventList
          rows={mine}
          unread={unread}
          footer={<EarlierEvents history={earlierMine} unread={unread} />}
          empty={{
            title: earlierMine.groups.length > 0 ? "Nothing this year yet" : "No event requests",
            message:
              "Planning an event? Make an event request: it covers the event's marketing, risks and budget.",
          }}
        />
      ),
    },
    ...(viewer?.reviews
      ? [
          {
            key: "review",
            label: "To review",
            badge: badge(waitingOnMe),
            messageBadge: badge(unreadIn(review)),
            render: () => (
              <EventList
                rows={review}
                groups={[{ title: "Waiting for approval", statuses: ["IN_PROGRESS"] }]}
                unread={unread}
                empty={{
                  title: "All caught up",
                  message: "Event forms waiting for your team's approval show up here.",
                }}
              />
            ),
          },
        ]
      : []),
    ...(viewer?.seesAll
      ? [
          {
            key: "all",
            label: "All",
            messageBadge: badge(unreadIn(all)),
            render: () => (
              <EventList
                rows={all}
                unread={unread}
                header={<FinanceSettingsButton year={me.year} />}
                footer={<EarlierEvents history={earlierAll} unread={unread} />}
                empty={{
                  title: "Nothing here",
                  message: `No event requests yet in ${me.year}.`,
                }}
              />
            ),
          },
        ]
      : []),
  ];
  const activeKey = tabs.some((t) => t.key === active) ? active : "mine";

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={activeKey}
      onActiveKeyChange={setActive}
      fullWidth
      footer={
        me.canRequestEvents ? (
          <FooterAction
            title="+ New Event Request"
            onPress={() => router.push("/event-requests/new")}
          />
        ) : undefined
      }
      footerTabKey="mine"
      onEndReached={(key) => {
        if (key === "mine") mineLoadMoreRef.current?.();
        if (key === "all") allLoadMoreRef.current?.();
      }}
    />
  );
}
