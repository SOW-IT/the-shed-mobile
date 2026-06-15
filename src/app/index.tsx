import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable } from "react-native";
import { api } from "../../convex/_generated/api";
import { HEAD_OF_DEPARTMENT, requestFullyApproved } from "../../shared/flow";
import { AllRequestsList } from "@/components/AllRequestsList";
import { GuideSheet, MyRequests } from "@/components/MyRequests";
import { ReviewList } from "@/components/ReviewList";
import { type RequestPrefill } from "@/components/MyRequests";
import {
  Avatar,
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  FadeInView,
  FooterAction,
  LoadingState,
  Muted,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  Select,
  Txt,
} from "@/components/ui";

const greetingForNow = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

/**
 * The Requests tab: your own requests, the ones waiting on you (approvers),
 * and every request this year (Finance) — one tab, switched by segments.
 * Push notifications deep-link here with ?tab=review.
 */
export default function RequestsScreen() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const me = useQuery(api.directory.me);
  const structure = useQuery(
    api.directory.yearStructure,
    me?.profile ? { year: me.year } : "skip"
  );
  const myRequests = useQuery(api.requests.myRequests, me?.profile ? {} : "skip");
  // Badge for the To Review segment (Convex dedupes with the tab badge).
  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
  // Unread comment counts for segment message badges.
  const myUnreadComments =
    useQuery(api.comments.myUnreadTotal, me?.profile ? {} : "skip") ?? 0;
  const reviewRequestIds = review
    ? [
        ...review.hod.map((r) => r._id),
        ...review.budgetManager.map((r) => r._id),
        ...review.director.map((r) => r._id),
        ...review.financeHead.map((r) => r._id),
        ...review.readyToPay.map((r) => r._id),
      ]
    : [];
  const reviewUnreadComments =
    useQuery(
      api.comments.unreadTotalForRequests,
      me?.profile && me.isApprover && review ? { requestIds: reviewRequestIds } : "skip"
    ) ?? 0;
  const financeMembers = useQuery(
    api.admin.financeMembers,
    me?.isFinanceHead ? { year: me.year } : "skip"
  );
  const setBudgetManager = useMutation(api.admin.setBudgetManager);
  const [newBudgetManagerEmail, setNewBudgetManagerEmail] = useState<string | null>(null);
  const [savingBudgetManager, setSavingBudgetManager] = useState(false);
  const [budgetManagerError, setBudgetManagerError] = useState<string | null>(null);
  const budgetManagerValue = newBudgetManagerEmail ?? structure?.budgetManagerEmail ?? "";
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
            label: "To Review",
            badge: reviewCount > 0 ? reviewCount : undefined,
            messageBadge: reviewUnreadComments > 0 ? reviewUnreadComments : undefined,
          },
        ]
      : []),
    ...(me?.isFinance ? [{ key: "all", label: "All" }] : []),
  ];

  // Deep links (e.g. a push notification) choose the segment via ?tab=.
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState("mine");
  useEffect(() => {
    if (typeof tab === "string") setActive(tab);
  }, [tab]);
  const activeSegment = segments.some((s) => s.key === active) ? active : "mine";

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

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState<RequestPrefill | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const openNewRequest = () => { setRequestPrefill(null); setNewRequestOpen(true); };

  const showMakeRequest = me?.profile != null && activeSegment === "mine";

  if (me === undefined) return <Screen><LoadingState /></Screen>;

  const firstName = me?.name?.split(" ")[0];

  return (
    <Screen
      subtitle={greetingForNow()}
      title={firstName ? `Hello, ${firstName}` : "Requests"}
      headerRight={
        me ? (
          <Pressable
            onPress={() => router.push("/profile")}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Avatar photo={me.photo} name={me.name} size={44} />
          </Pressable>
        ) : undefined
      }
      footer={showMakeRequest ? <FooterAction title="+ Make Request" onPress={openNewRequest} onInfo={() => setGuideOpen(true)} /> : undefined}
    >
      {me === null || me.profile === null ? (
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
      ) : (
        <>
          <FadeInView delay={40}>
            <Segmented segments={segments} active={activeSegment} onChange={setActive} />
          </FadeInView>
          {activeSegment === "review" ? (
            <ReviewList />
          ) : activeSegment === "all" ? (
            <>
              {me?.isFinanceHead && (
                <>
                  <SectionTitle>Budget Manager — {me.year}</SectionTitle>
                  <Card>
                    <Muted>Current: {structure?.budgetManagerEmail ?? "not set"}</Muted>
                    <Select
                      label="Budget Manager (Finance department members)"
                      value={budgetManagerValue}
                      options={(financeMembers ?? []).map((p) => ({
                        label: p.name ? `${p.name} (${p.email})` : p.email,
                        value: p.email,
                      }))}
                      onSelect={setNewBudgetManagerEmail}
                      placeholder="Choose a Finance member…"
                    />
                    <ErrorBanner message={budgetManagerError} />
                    <Btn
                      title="Set Budget Manager"
                      loading={savingBudgetManager}
                      disabled={!budgetManagerValue}
                      onPress={() => {
                        setSavingBudgetManager(true);
                        setBudgetManagerError(null);
                        void setBudgetManager({ year: me.year, email: budgetManagerValue })
                          .then(() => setNewBudgetManagerEmail(null))
                          .catch((e) => setBudgetManagerError(errorMessage(e)))
                          .finally(() => setSavingBudgetManager(false));
                      }}
                    />
                  </Card>
                  <SectionTitle>All Requests — {me.year}</SectionTitle>
                </>
              )}
              <AllRequestsList />
            </>
          ) : (
            <MyRequests
              departments={departmentNames}
              defaultDepartment={defaultDepartment}
              newOpen={newRequestOpen}
              prefill={requestPrefill}
              onResubmit={(p) => { setRequestPrefill(p); setNewRequestOpen(true); }}
              onNewClose={() => setNewRequestOpen(false)}
              onShowGuide={() => setGuideOpen(true)}
            />
          )}
        </>
      )}
      <GuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} />
    </Screen>
  );
}
