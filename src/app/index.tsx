import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { api } from "../../convex/_generated/api";
import { AllRequestsList } from "@/components/AllRequestsList";
import { MyRequests } from "@/components/MyRequests";
import { ReviewList } from "@/components/ReviewList";
import {
  Avatar,
  Btn,
  Card,
  Muted,
  Row,
  Screen,
  Segmented,
  Txt,
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
  // Badge for the To Review segment (Convex dedupes with the tab badge).
  const review = useQuery(
    api.requests.toReview,
    me?.profile && me.isApprover ? {} : "skip"
  );
  const reviewCount = review
    ? review.hod.length +
      review.budgetManager.length +
      review.director.length +
      review.financeHead.length +
      review.readyToPay.length
    : 0;

  const segments = [
    { key: "mine", label: "Mine" },
    ...(me?.isApprover
      ? [{ key: "review", label: "To Review", badge: reviewCount }]
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
  // Own department, or (for Heads of Division) one under their division.
  const defaultDepartment =
    me?.profile?.department ??
    (structure?.departments ?? []).find(
      (d) => d.division === me?.profile?.division
    )?.name ??
    "";

  if (me === undefined) return <Screen />;

  return (
    <Screen>
      {me === null || me.profile === null ? (
        <Card>
          <Txt style={styles.title}>Welcome{me?.name ? `, ${me.name}` : ""}</Txt>
          <Muted>
            No role or department is assigned to {me?.email} for {me?.year} yet.
            Ask an admin (Data and IT or Human Resources) to set you up.
          </Muted>
          <Row>
            <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} />
          </Row>
        </Card>
      ) : (
        <>
          <Card>
            <Row>
              <Avatar photo={me.photo} name={me.name} size={44} />
              <View style={{ flexGrow: 1, flexShrink: 1 }}>
                <Txt style={{ fontWeight: "700" }}>{me.name ?? me.email}</Txt>
                <Muted>
                  {me.profile.roles.join(", ")} •{" "}
                  {[me.profile.department, me.profile.division]
                    .filter(Boolean)
                    .join(" / ") || "—"}{" "}
                  • {me.year}
                </Muted>
              </View>
              <Btn title="Sign out" variant="ghost" onPress={() => void signOut()} />
            </Row>
          </Card>
          <Segmented segments={segments} active={activeSegment} onChange={setActive} />
          {activeSegment === "review" ? (
            <ReviewList />
          ) : activeSegment === "all" ? (
            <AllRequestsList />
          ) : (
            <MyRequests
              departments={departmentNames}
              defaultDepartment={defaultDepartment}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, fontWeight: "700" },
});
