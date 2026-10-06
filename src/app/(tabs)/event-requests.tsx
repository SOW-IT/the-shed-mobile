import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { ReactNode, useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EventRequestStatus } from "@shared/eventRequests";
import { ChromeScreen } from "@/components/ChromeScreen";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { EventRequestRow, type EventRequestListRow } from "@/components/events/EventRequestRow";
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

type Group = { title: string; statuses: EventRequestStatus[] };

const GROUPS: Group[] = [
  { title: "In progress", statuses: ["IN_PROGRESS"] },
  { title: "Approved", statuses: ["APPROVED"] },
  { title: "Cancelled", statuses: ["CANCELLED"] },
];

type Unread = Record<string, Partial<Record<string, number>>>;
const unreadFor = (unread: Unread, id: string) =>
  Object.values(unread[id] ?? {}).reduce<number>((sum, n) => sum + (n ?? 0), 0);

const EventList = ({
  rows,
  groups = GROUPS,
  unread,
  empty,
  header,
}: {
  rows: EventRequestListRow[] | null | undefined;
  groups?: Group[];
  unread: Unread;
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
          <EmptyState icon="calendar-outline" title={empty.title} message={empty.message} />
        ) : null}
        {groups.map((group) => {
          const inGroup = (rows ?? []).filter((r) => group.statuses.includes(r.status));
          if (inGroup.length === 0) return null;
          return (
            <View key={group.title} style={{ gap: spacing.sm }}>
              <SectionTitle>
                {group.title} · {inGroup.length}
              </SectionTitle>
              {inGroup.map((event) => (
                <FadeInView key={event._id} delay={stagger(index++)}>
                  <EventRequestRow
                    event={event}
                    unread={unreadFor(unread, event._id)}
                    onPress={() => router.push(`/event-requests/${event._id}`)}
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
 * Event Requests: your department's events (Mine); for Marketing, Compliance,
 * Finance and the Director, the forms waiting for review (To review); and for
 * them, Events and admins, every event by staff year (All).
 */
export default function EventRequestsScreen() {
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const staff = !!me?.profile && !me.isCampusLeader;
  const viewer = useQuery(api.eventRequests.viewer, staff ? {} : "skip");
  const years = useQuery(api.eventRequests.years, staff ? {} : "skip");
  const [mineYear, setMineYear] = useState<number | null>(null);
  const [allYear, setAllYear] = useState<number | null>(null);
  const mine = useQuery(
    api.eventRequests.mine,
    staff ? (mineYear === null ? {} : { year: mineYear }) : "skip"
  );
  const review = useQuery(api.eventRequests.review, viewer?.reviews ? {} : "skip");
  const shownAllYear = allYear ?? me?.year;
  const all = useQuery(
    api.eventRequests.all,
    viewer?.seesAll && shownAllYear !== undefined ? { year: shownAllYear } : "skip"
  );
  const ids = [
    ...new Set([...(mine ?? []), ...(review ?? []), ...(all ?? [])].map((r) => r._id)),
  ] as Id<"eventRequests">[];
  const unread =
    useQuery(api.eventRequestComments.unreadCounts, ids.length > 0 ? { ids } : "skip") ?? {};

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
  if (!staff) {
    return (
      <ChromeScreen>
        <Card>
          <Txt style={{ fontSize: 18, fontWeight: "700" }}>Event Requests</Txt>
          <Muted>
            {me.profile
              ? "Event requests are for SOW staff, not campus leaders."
              : `Event requests are for SOW staff. No role or department is assigned to ${me.email} for ${me.year} yet.`}
          </Muted>
        </Card>
      </ChromeScreen>
    );
  }

  const unreadIn = (rows: EventRequestListRow[] | null | undefined) =>
    (rows ?? []).reduce((sum, r) => sum + unreadFor(unread, r._id), 0);
  const waitingOnMe = (review ?? []).reduce((n, r) => n + (r.waitingOnMe?.length ?? 0), 0);
  const badge = (count: number) => (count > 0 ? count : undefined);
  const mineYears = years?.mine ?? [];

  const tabs: PagerTab[] = [
    {
      key: "mine",
      label: "Mine",
      messageBadge: badge(unreadIn(mine)),
      render: () => (
        <EventList
          rows={mine}
          unread={unread}
          header={
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
            title: "No event requests",
            message:
              mineYear === null
                ? "Planning an event? Make an event request: it covers the event's marketing, risks and budget."
                : `Your department made no event requests in ${mineYear}.`,
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
                empty={{
                  title: "Nothing here",
                  message: `There were no event requests in ${shownAllYear}.`,
                }}
              />
            ),
          },
        ]
      : []),
  ];
  const activeKey = tabs.some((t) => t.key === active) ? active : "mine";
  const allYears = years?.all ?? [];

  return (
    <PagerScreen
      tabs={tabs}
      activeKey={activeKey}
      onActiveKeyChange={setActive}
      fullWidth
      footer={
        <FooterAction
          title="+ New Event Request"
          onPress={() => router.push("/event-requests/new")}
        />
      }
      footerTabKey="mine"
      floating={
        activeKey === "all" && allYears.length > 1 ? (
          <FloatingYearPicker
            year={shownAllYear ?? me.year}
            years={allYears}
            onSelect={(y) => setAllYear(y === me.year ? null : y)}
          />
        ) : undefined
      }
    />
  );
}
