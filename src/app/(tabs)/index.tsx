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

export default function RequestsScreen() {
  const { signOut } = useAuthActions();
  const me = useQuery(api.directory.me);
  const structure = useQuery(
    api.directory.yearStructure,
    me?.profile ? { year: me.year } : "skip"
  );
  const myRequests = useQuery(api.requests.myRequests, me?.profile ? {} : "skip");
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const requestYears = useQuery(
    api.requests.requestYears,
    me?.profile ? {} : "skip"
  );
  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab]);
  const markReadForRequest = useMutation(api.notifications.markReadForRequest);
  useEffect(() => {
    if (typeof focus === "string" && focus) {
      void markReadForRequest({ requestId: focus as Id<"requests"> }).catch(() => {});
    }
  }, [focus, markReadForRequest]);
  const activeSegment = segments.some((s) => s.key === active) ? active : "mine";

  const currentYear = me?.year;
  const viewingYear = selectedYear ?? currentYear ?? new Date().getFullYear();
  const isPastYear =
    activeSegment === "all" &&
    currentYear != null &&
    selectedYear != null &&
    selectedYear !== currentYear;
  const queryYear = isPastYear ? (selectedYear as number) : undefined;
  const pickerYears = requestYears?.all ?? [];

  const isPreviousYear =
    isPastYear && selectedYear === (currentYear as number) - 1;
  const isOlderYear =
    isPastYear && (selectedYear as number) < (currentYear as number) - 1;
  const nextRolloverYear = currentYear as number;

  const departmentNames = (structure?.departments ?? []).map((d) => d.name);
  const myAssignments = me?.profile?.assignments ?? [];
  const defaultDepartment =
    myAssignments.find((a) => a.role === HEAD_OF_DEPARTMENT && a.department)
      ?.department ??
    myAssignments.find((a) => a.department)?.department ??
    (structure?.departments ?? []).find((d) =>
      (me?.profile?.divisions ?? []).includes(d.division)
    )?.name ??
    "";

  const directorThreshold = directorThresholdOr(structure?.directorApprovalThreshold);

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState<RequestPrefill | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const openNewRequest = () => { setRequestPrefill(null); setNewRequestOpen(true); };

  const showMakeRequest = me?.profile != null;

  const loadMoreRef = useRef<(() => void) | null>(null);

  if (me === undefined) return <Screen><LoadingState /></Screen>;

  if (me?.isCampusLeader) return <Redirect href="/attendance" />;

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
        fullWidth
        onEndReached={(key) => {
          if (key === "all") loadMoreRef.current?.();
        }}
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
