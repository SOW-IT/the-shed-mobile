import { useMutation, useQuery } from "convex/react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import {
  directorThresholdOr,
  HEAD_OF_DEPARTMENT,
  requestFullyApproved,
} from "../../../shared/flow";
import { threadDeepLinkKey } from "../../../shared/deepLinks";
import { AllRequestsList } from "@/components/AllRequestsList";
import { BankTab } from "@/components/BankTab";
import { ChromeScreen } from "@/components/ChromeScreen";
import { ExportRequestsCard } from "@/components/ExportRequestsCard";
import { GuideSheet, MyRequests } from "@/components/MyRequests";
import { type RequestPrefill } from "@/components/MyRequests";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { ReviewedInYear, ReviewList } from "@/components/ReviewList";
import { SignInPrompt } from "@/components/SignInPrompt";
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
import { useSignOut } from "@/hooks/usePushRegistration";
import { typography } from "@/theme";

export default function RequestsScreen() {
  const signOut = useSignOut();
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
    ...(me?.isApprover || requestYears?.reviewedBefore
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
  const focusReopenKey = typeof reopen === "string" ? reopen : undefined;
  // A repeated query key arrives as an array; only a single id can be focused.
  const focusId = typeof focus === "string" && focus ? focus : undefined;
  // A thread link opens its thread once. After that, a card re-mounted for the
  // same link (e.g. approving moves it to Reviewed) must not open it again.
  const threadLinkKey = threadDeepLinkKey(focusId, thread, focusReopenKey);
  const [openedThreadLink, setOpenedThreadLink] = useState<string | null>(null);
  const focusThread = threadLinkKey !== null && threadLinkKey !== openedThreadLink;
  const onFocusThreadOpened = useCallback(
    () => setOpenedThreadLink(threadLinkKey),
    [threadLinkKey]
  );
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external param sync
    if (typeof tab === "string") setActive(tab);
  }, [tab, reopen]);
  const markReadForRequest = useMutation(api.notifications.markReadForRequest);
  useEffect(() => {
    if (focusId) {
      void markReadForRequest({ requestId: focusId as Id<"requests"> }).catch(() => {});
    }
  }, [focusId, markReadForRequest]);
  const landing = reviewCount > 0 && mineCount === 0 ? "review" : "mine";
  const wanted = active ?? landing;
  const activeSegment = segments.some((s) => s.key === wanted) ? wanted : "mine";

  const currentYear = me?.year;
  // One picked year across Mine, Review and All, each offering only years
  // it has something for (your requests, ones you reviewed, every request);
  // a tab without the picked year shows this year instead.
  const yearsFor = (key: string): number[] =>
    key === "mine"
      ? (requestYears?.mine ?? [])
      : key === "review"
        ? (requestYears?.reviewed ?? [])
        : key === "all"
          ? (requestYears?.all ?? [])
          : [];
  const pastYearFor = (key: string): number | undefined =>
    currentYear != null &&
    selectedYear != null &&
    selectedYear !== currentYear &&
    yearsFor(key).includes(selectedYear)
      ? selectedYear
      : undefined;
  const pickerYears = yearsFor(activeSegment);
  const viewingYear =
    pastYearFor(activeSegment) ?? currentYear ?? new Date().getFullYear();

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

  if (me === null) {
    if (!focusId && typeof tab !== "string") return <Redirect href="/home" />;
    return (
      <ChromeScreen>
        <SignInPrompt what={focusId ? "reimbursement request" : "page"} />
      </ChromeScreen>
    );
  }

  if (me.profile === null) {
    if (!focusId && typeof tab !== "string") return <Redirect href="/org" />;
    return (
      <ChromeScreen>
        <FadeInView>
          <Card>
            <Txt style={typography.section}>
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

  const receiptFilesBanner = (pastYear: number | undefined) =>
    pastYear === undefined ? null : (
      <FadeInView delay={40}>
        <WarningBanner
          message={
            pastYear === me.year - 1
              ? `Receipt files for the ${pastYear} staff year will be deleted on 1 October ${me.year}, when the staff year rolls over. Download anything you need to keep.`
              : `Receipt files for the ${pastYear} staff year have already been deleted and can no longer be opened. Only the file names remain for reference.`
          }
        />
      </FadeInView>
    );

  const renderAll = () => (
    <>
      {receiptFilesBanner(pastYearFor("all"))}
      <ExportRequestsCard currentYear={me.year} />
      <AllRequestsList
        year={pastYearFor("all")}
        loadMoreRef={loadMoreRef}
        focusId={focusId}
        focusThread={focusThread}
        focusReopenKey={focusReopenKey}
        onFocusThreadOpened={onFocusThreadOpened}
      />
    </>
  );

  const renderTab = (key: string) => {
    switch (key) {
      case "review": {
        const pastYear = pastYearFor("review");
        return (
          <ReadableColumn>
            {receiptFilesBanner(pastYear)}
            {pastYear !== undefined ? (
              <ReviewedInYear
                year={pastYear}
                focusId={focusId}
                focusThread={focusThread}
                focusReopenKey={focusReopenKey}
                onFocusThreadOpened={onFocusThreadOpened}
              />
            ) : (
              <ReviewList
                focusId={focusId}
                focusThread={focusThread}
                focusReopenKey={focusReopenKey}
                onFocusThreadOpened={onFocusThreadOpened}
              />
            )}
          </ReadableColumn>
        );
      }
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
          <>
            {receiptFilesBanner(pastYearFor("mine"))}
            <MyRequests
              year={pastYearFor("mine")}
              departments={departmentNames}
              defaultDepartment={defaultDepartment}
              newOpen={newRequestOpen}
              prefill={requestPrefill}
              onResubmit={(p) => { setRequestPrefill(p); setNewRequestOpen(true); }}
              onNewClose={() => setNewRequestOpen(false)}
              onMakeRequest={showMakeRequest ? openNewRequest : undefined}
              directorThreshold={directorThreshold}
              focusId={focusId}
              focusThread={focusThread}
              focusReopenKey={focusReopenKey}
              onFocusThreadOpened={onFocusThreadOpened}
            />
          </>
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
        floatingAboveFooter
        floating={
          pickerYears.length > 1 ? (
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
