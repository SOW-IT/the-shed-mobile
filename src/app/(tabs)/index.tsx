import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  directorThresholdOr,
  HEAD_OF_DEPARTMENT,
  requestFullyApproved,
} from "../../../shared/flow";
import { AdminBar } from "@/components/AdminBar";
import { AllRequestsList } from "@/components/AllRequestsList";
import { BankTab } from "@/components/BankTab";
import { ChromeScreen } from "@/components/ChromeScreen";
import { ExportRequestsCard } from "@/components/ExportRequestsCsv";
import { GuideSheet, MyRequests } from "@/components/MyRequests";
import { type RequestPrefill } from "@/components/MyRequests";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { ReviewList } from "@/components/ReviewList";
import {
  Btn,
  Card,
  FadeInView,
  ReadableColumn,
  FloatingYearPicker,
  FooterAction,
  LoadingState,
  Muted,
  Row,
  Screen,
  Txt,
  WarningBanner,
} from "@/components/ui";

/**
 * The Requests tab: your own requests, the ones waiting on you (approvers),
 * and every request this year (Finance) — one tab, switched by segments.
 * Push notifications deep-link here with ?tab=review.
 */
export default function RequestsScreen() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.directory.me);
  const structure = useQuery(
    api.directory.yearStructure,
    me?.profile ? { year: me.year } : "skip"
  );
  const myRequests = useQuery(api.requests.myRequests, me?.profile ? {} : "skip");
  // Past-year browsing for the Mine / All segments. null = the live staff year.
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const requestYears = useQuery(
    api.requests.requestYears,
    me?.profile ? {} : "skip"
  );
  // Badge for the To Review segment (Convex dedupes with the tab badge).
  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
  // Unread comment counts for segment message badges.
  const myUnreadComments =
    useQuery(api.comments.myUnreadTotal, me?.profile ? {} : "skip") ?? 0;
  const reviewedForBadge = useQuery(
    api.requests.reviewed,
    me?.profile && me.isApprover ? {} : "skip"
  );
  const reviewRequestIds = [
    ...(review?.hod.map((r) => r._id) ?? []),
    ...(review?.budgetManager.map((r) => r._id) ?? []),
    ...(review?.director.map((r) => r._id) ?? []),
    ...(review?.financeHead.map((r) => r._id) ?? []),
    ...(review?.readyToPay.map((r) => r._id) ?? []),
    ...(reviewedForBadge?.map((r) => r._id) ?? []),
  ];
  const reviewUnreadComments =
    useQuery(
      api.comments.unreadTotalForRequests,
      me?.profile && me.isApprover && review && reviewedForBadge
        ? { requestIds: reviewRequestIds }
        : "skip"
    ) ?? 0;
  // Unread comments across every request this year, for the "All" segment badge
  // (Finance only). Reuses the same query the All list subscribes to, so Convex
  // dedupes the subscription.
  const allRequestsForBadge = useQuery(
    api.requests.allRequests,
    me?.isFinance ? {} : "skip"
  );
  const allUnreadComments =
    useQuery(
      api.comments.unreadTotalForRequests,
      me?.isFinance && allRequestsForBadge
        ? { requestIds: allRequestsForBadge.map((r) => r._id) }
        : "skip"
    ) ?? 0;
  const reviewCount = review
    ? review.hod.length +
      review.budgetManager.length +
      review.director.length +
      review.financeHead.length +
      review.readyToPay.length
    : 0;

  const mineCount = (myRequests ?? []).filter(
    (r) => requestFullyApproved(r) && !r.receipt
  ).length;

  const segments = [
    {
      key: "mine",
      label: "Mine",
      badge: mineCount > 0 ? mineCount : undefined,
      messageBadge: myUnreadComments > 0 ? myUnreadComments : undefined,
    },
    ...(me?.isApprover
      ? [
          {
            key: "review",
            label: "Review",
            badge: reviewCount > 0 ? reviewCount : undefined,
            messageBadge: reviewUnreadComments > 0 ? reviewUnreadComments : undefined,
          },
        ]
      : []),
    ...(me?.isFinance
      ? [
          {
            key: "all",
            label: "All",
            messageBadge: allUnreadComments > 0 ? allUnreadComments : undefined,
          },
        ]
      : []),
    { key: "bank", label: "Bank" },
  ];

  // Deep links (e.g. a notification) choose the segment via ?tab= and, when
  // they're about a specific request, focus it via ?focus=<id> (and ?thread=1
  // to open its comment thread). Notification taps also append ?reopen=<token>
  // so a mounted card can reopen the same dismissed thread on repeated taps.
  const { tab, focus, thread, reopen } = useLocalSearchParams<{
    tab?: string;
    focus?: string;
    thread?: string;
    reopen?: string;
  }>();
  const focusThread = thread === "1";
  const focusReopenKey = typeof reopen === "string" ? reopen : undefined;
  const [active, setActive] = useState("mine");
  useEffect(() => {
    // Sync the segment to the deep-link param when it changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab]);
  // Landing on a focused request "sees" its notifications — clear them all.
  const markReadForRequest = useMutation(api.notifications.markReadForRequest);
  useEffect(() => {
    if (typeof focus === "string" && focus) {
      void markReadForRequest({ requestId: focus as Id<"requests"> }).catch(() => {});
    }
  }, [focus, markReadForRequest]);
  const activeSegment = segments.some((s) => s.key === active) ? active : "mine";

  // Year browsing only applies to the "All" segment. "Mine" and "To Review"
  // always show the live staff year (with carry-over). null = live year;
  // picking an earlier year shows that year's requests read-only.
  const currentYear = me?.year;
  const viewingYear = selectedYear ?? currentYear ?? new Date().getFullYear();
  const isPastYear =
    activeSegment === "all" &&
    currentYear != null &&
    selectedYear != null &&
    selectedYear !== currentYear;
  const queryYear = isPastYear ? (selectedYear as number) : undefined;
  const pickerYears = requestYears?.all ?? [];

  // Viewing last staff year: its paid requests' receipt files get purged at the
  // next Oct 1 rollover (the retention cron), so warn before they're gone.
  const isPreviousYear =
    isPastYear && selectedYear === (currentYear as number) - 1;
  // Two or more staff years back: a rollover has already run, so those receipt
  // files are gone.
  const isOlderYear =
    isPastYear && (selectedYear as number) < (currentYear as number) - 1;
  // The calendar year of the upcoming 1 October (the rollover / purge date).
  // The current staff year is named after that very date, so it IS the next
  // rollover's calendar year — and it already flips at Sydney midnight Oct 1
  // (see staffYearForDate), keeping the picker, me.year and this banner aligned.
  const nextRolloverYear = currentYear as number;

  const departmentNames = (structure?.departments ?? []).map((d) => d.name);
  // Default to a department they are Head of Department of, else the first
  // department in their assignments, else (for a pure Head of Division) the
  // first department under a division they head. They may still pick any.
  const myAssignments = me?.profile?.assignments ?? [];
  const defaultDepartment =
    myAssignments.find((a) => a.role === HEAD_OF_DEPARTMENT && a.department)
      ?.department ??
    myAssignments.find((a) => a.department)?.department ??
    (structure?.departments ?? []).find((d) =>
      (me?.profile?.divisions ?? []).includes(d.division)
    )?.name ??
    "";

  // The live year's Director-approval cutoff (Finance-configurable), resolved
  // to the standard $5,000 until the setting loads or when unset.
  const directorThreshold = directorThresholdOr(structure?.directorApprovalThreshold);

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState<RequestPrefill | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const openNewRequest = () => { setRequestPrefill(null); setNewRequestOpen(true); };

  // Keep the footer mounted for anyone with a profile, on every segment — the
  // PagerScreen slides it down when the swipe leaves "mine" (footerTabKey) and
  // back up on return, so it isn't gated on the active segment here.
  const showMakeRequest = me?.profile != null;

  // Wired to AllRequestsList's infinite-scroll "reveal more" handler (or null).
  const loadMoreRef = useRef<(() => void) | null>(null);

  if (me === undefined) return <Screen><LoadingState /></Screen>;

  if (me?.isCampusLeader) return <Redirect href="/attendance" />;

  // Visitors (signed out) land on the public Home tab — "/" is still the web
  // entry point even though the Requests tab is hidden for them (1.7.5).
  if (me === null) return <Redirect href="/home" />;

  if (me.profile === null) {
    return (
      <ChromeScreen>
        <FadeInView>
          <Card>
            <Txt style={{ fontSize: 18, fontWeight: "700" }}>
              Welcome{me?.name ? `, ${me.name}` : ""}
            </Txt>
            <Muted>
              No role or department is assigned to {me?.email} for {me?.year} yet.
              Ask an admin (Data and IT or Human Resources) to set you up.
            </Muted>
            <Row>
              <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} />
            </Row>
          </Card>
        </FadeInView>
      </ChromeScreen>
    );
  }

  // The "All" page (Finance): an Admin bar into the finance settings (Budget
  // Manager, Director threshold, delegation — for admins / the Finance Head),
  // year-purge warnings, then every request for the viewed year.
  const renderAll = () => (
    <>
      {(me.isAdmin || me.isFinanceHead) && <AdminBar tab="other" />}
      {isPreviousYear && (
        <FadeInView delay={40}>
          <WarningBanner
            message={`Receipt files for the ${viewingYear} staff year will be deleted on 1 October ${nextRolloverYear}, when the staff year rolls over. Download anything you need to keep.`}
          />
        </FadeInView>
      )}
      {isOlderYear && (
        <FadeInView delay={40}>
          <WarningBanner
            message={`Receipt files for the ${viewingYear} staff year have already been deleted and can no longer be opened. Only the file names remain for reference.`}
          />
        </FadeInView>
      )}
      <ExportRequestsCard currentYear={me.year} />
      <AllRequestsList
        year={queryYear}
        loadMoreRef={loadMoreRef}
        focusId={focus}
        focusThread={focusThread}
        focusReopenKey={focusReopenKey}
      />
    </>
  );

  const renderTab = (key: string) => {
    switch (key) {
      case "review":
        // Review + Bank stay single-column, so cap them for readability even
        // though the pager is full-width for the multi-column Mine/All lists.
        return (
          <ReadableColumn>
            <ReviewList focusId={focus} focusThread={focusThread} focusReopenKey={focusReopenKey} />
          </ReadableColumn>
        );
      case "all":
        return renderAll();
      case "bank":
        return (
          <ReadableColumn>
            <BankTab />
          </ReadableColumn>
        );
      default:
        return (
          <MyRequests
            departments={departmentNames}
            defaultDepartment={defaultDepartment}
            newOpen={newRequestOpen}
            prefill={requestPrefill}
            onResubmit={(p) => { setRequestPrefill(p); setNewRequestOpen(true); }}
            onNewClose={() => setNewRequestOpen(false)}
            directorThreshold={directorThreshold}
            focusId={focus}
            focusThread={focusThread}
            focusReopenKey={focusReopenKey}
          />
        );
    }
  };

  const tabs: PagerTab[] = segments.map((segment) => ({
    ...segment,
    render: () => renderTab(segment.key),
  }));

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={activeSegment}
        onActiveKeyChange={setActive}
        // Wide screens lay the Mine/All request lists out as columns (the Grid
        // in each list); Review/Bank cap themselves with ReadableColumn.
        fullWidth
        onEndReached={(key) => {
          if (key === "all") loadMoreRef.current?.();
        }}
        // Mounted on every segment so it can slide down on swipe-away and back
        // up on return (see footerTabKey); PagerScreen drives the animation.
        footer={
          showMakeRequest ? (
            <FooterAction
              title="+ Make Request"
              onPress={openNewRequest}
              onInfo={() => setGuideOpen(true)}
            />
          ) : undefined
        }
        footerTabKey="mine"
        floating={
          activeSegment === "all" && pickerYears.length > 1 ? (
            <FloatingYearPicker
              year={viewingYear}
              years={pickerYears}
              onSelect={(y) => setSelectedYear(y === currentYear ? null : y)}
            />
          ) : undefined
        }
      />
      <GuideSheet
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
        directorThreshold={directorThreshold}
      />
    </>
  );
}
