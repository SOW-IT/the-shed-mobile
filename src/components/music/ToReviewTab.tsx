import { MusicActionsMenu } from "@/components/music/MusicActionMenu";
import {
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  Field,
  LoadingState,
  Muted,
  Sheet,
} from "@/components/ui";
import { usePagedQuery } from "@/hooks/usePagedQuery";
import { radius, spacing, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useConvexAuth, useMutation } from "convex/react";
import type { MutableRefObject, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";
import {
  DetailLine,
  FilterChips,
  formatDate,
  type MusicRequest,
  type MusicRowActions,
  MyRequestCard,
  PAGE_SIZE,
  type RequestFilter,
  SongCardPress,
  SongDetailsSheet,
  SongHeader,
  SongLinks,
} from "./MusicRequestParts";

export const ToReviewTab = ({
  onEditRequest,
  onDeleteRequest,
  canManageRequests = false,
  loadMoreRef,
}: MusicRowActions & {
  canManageRequests?: boolean;
  loadMoreRef?: MutableRefObject<(() => void) | null>;
} = {}) => {
  const t = useAppTheme();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [filter, setFilter] = useState<RequestFilter>("PENDING");
  const showingPending = filter === "PENDING";
  // Backend query and mutations enforce Praise Manager access.
  const review = usePagedQuery(api.musicRequests.reviewPage, {
    args: (cursor) =>
      !isLoading && isAuthenticated
        ? {
            paginationOpts: { numItems: PAGE_SIZE, cursor },
            status: showingPending ? ("PENDING" as const) : ("DECLINED" as const),
          }
        : "skip",
    scopeKey: filter,
    rowsOf: (result) => result.page,
    keyOf: (row) => row._id,
    loadMoreRef,
    keepRowsWhileLoading: true,
  });
  const visibleRequests = review.rows;
  const [declineTarget, setDeclineTarget] = useState<MusicRequest | null>(null);
  const [details, setDetails] = useState<MusicRequest | null>(null);

  return (
    <View style={styles.section}>
      <FilterChips
        value={filter}
        onChange={setFilter}
        options={["PENDING", "DECLINED"]}
      />

      {!review.loadingFirstPage ? (
        <View style={styles.requestSectionHeading}>
          <Text style={{ color: t.faint, fontSize: 13 }}>
            {`${visibleRequests.length}${review.hasMore ? "+" : ""} ${
              showingPending ? "pending" : "declined"
            } song ${visibleRequests.length === 1 && !review.hasMore ? "request" : "requests"}`}
          </Text>
        </View>
      ) : null}

      {review.loadingFirstPage ? (
        <LoadingState />
      ) : visibleRequests.length === 0 ? (
        <View
          style={[styles.emptyReview, { backgroundColor: t.inputBackground }]}
        >
          <Ionicons
            name={
              showingPending
                ? "checkmark-circle-outline"
                : "close-circle-outline"
            }
            size={32}
            color={showingPending ? t.success : t.faint}
          />

          <Text style={{ color: t.text, fontWeight: "700" }}>
            {showingPending ? "You're all caught up!" : "No declined requests"}
          </Text>

          <Text style={{ color: t.faint, fontSize: 13 }}>
            {showingPending
              ? "No requests need reviewing."
              : "Previously declined songs will appear here."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={visibleRequests}
          scrollEnabled={false}
          keyExtractor={(item) => item._id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) =>
            showingPending ? (
              <ReviewCard
                request={item}
                canManageRequests={canManageRequests}
                onDecline={() => setDeclineTarget(item)}
                onPress={() => setDetails(item)}
                actions={
                  onEditRequest || onDeleteRequest ? (
                    <MusicActionsMenu
                      onEdit={() => onEditRequest?.(item)}
                      onDelete={() => onDeleteRequest?.(item)}
                    />
                  ) : undefined
                }
              />
            ) : (
              <MyRequestCard
                request={item}
                showRequester
                onPress={() => setDetails(item)}
              />
            )
          }
        />
      )}
      {review.loadingMore ? <LoadingState /> : null}
      <DeclineSheet
        request={declineTarget}
        onClose={() => setDeclineTarget(null)}
      />
      <SongDetailsSheet request={details} onClose={() => setDetails(null)} />
    </View>
  );
};

function DeclineSheet({
  request,
  onClose,
}: {
  request: MusicRequest | null;
  onClose: () => void;
}) {
  const decline = useMutation(api.musicRequests.decline);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shownFor, setShownFor] = useState(request?._id);
  const openFor = useRef(request?._id);
  useEffect(() => {
    openFor.current = request?._id;
  }, [request?._id]);
  if (shownFor !== request?._id) {
    setShownFor(request?._id);
    setReason("");
    setError(null);
    setSubmitting(false);
  }

  const handleDecline = async () => {
    if (!request || submitting) return;
    const requestId = request._id;
    const stillOpen = () => openFor.current === requestId;
    setError(null);
    setSubmitting(true);
    try {
      await decline({ requestId, reason: reason.trim() || undefined });
      if (stillOpen()) onClose();
    } catch (e) {
      if (stillOpen()) setError(errorMessage(e));
    } finally {
      if (stillOpen()) setSubmitting(false);
    }
  };

  return (
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Decline song"
      footer={
        <View style={styles.stackSm}>
          <Btn
            title="Decline"
            variant="danger"
            loading={submitting}
            onPress={handleDecline}
          />
          <Btn title="Back" variant="ghost" onPress={onClose} />
        </View>
      }
    >
      {request ? (
        <Muted>
          {request.title} by {request.artist}, requested by{" "}
          {request.requesterName ?? request.requesterEmail}. They&apos;ll see
          your reason in the app.
        </Muted>
      ) : null}
      <Field
        label="Reason (optional)"
        value={reason}
        onChangeText={setReason}
        placeholder="Why isn't this song a fit?"
        autoCapitalize="sentences"
        multiline
      />
      <ErrorBanner message={error} />
    </Sheet>
  );
}

function ReviewCard({
  request,
  actions,
  canManageRequests,
  onDecline,
  onPress,
}: {
  request: MusicRequest;
  actions?: ReactNode;
  canManageRequests: boolean;
  onDecline: () => void;
  onPress?: () => void;
}) {
  const t = useAppTheme();
  const approve = useMutation(api.musicRequests.approve);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onApprove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await approve({ requestId: request._id });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <View style={styles.requestCardContent}>
        <View style={styles.row}>
          <View style={styles.fill}>
            <SongCardPress request={request} onPress={onPress}>
              <SongHeader request={request} />
            </SongCardPress>
          </View>
          {actions}
        </View>
        <DetailLine icon="person-outline">
          Requested by {request.requesterName ?? request.requesterEmail}
        </DetailLine>
        <DetailLine icon="calendar-outline">
          Requested {formatDate(request._creationTime)}
        </DetailLine>
        {request.requestComment?.trim() ? (
          <View
            style={{
              gap: 5,
              marginTop: spacing.sm,
            }}
          >
            <Text
              style={{
                color: t.faint,
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 0.6,
              }}
            >
              REQUEST NOTE
            </Text>
            <Text
              style={{
                color: t.text,
                fontSize: 14,
                lineHeight: 21,
              }}
            >
              {request.requestComment}
            </Text>
          </View>
        ) : null}
        <SongLinks link={request.link} onHistory={onPress} />
        <ErrorBanner message={error} />
        {canManageRequests && (
          <View style={styles.reviewActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Approve ${request.title}`}
              disabled={busy}
              onPress={() => void onApprove()}
              style={[
                styles.reviewActionButton,
                { backgroundColor: t.success, opacity: busy ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.reviewActionText}>Approve</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Decline ${request.title}`}
              disabled={busy}
              onPress={onDecline}
              style={[
                styles.reviewActionButton,
                { backgroundColor: t.danger, opacity: busy ? 0.5 : 1 },
              ]}
            >
              <Ionicons name="close" size={18} color="#fff" />
              <Text style={styles.reviewActionText}>Decline</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  requestSectionHeading: { gap: 4, marginBottom: 4 },
  requestCardContent: { gap: 12 },
  reviewActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  reviewActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  reviewActionText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  emptyReview: {
    alignItems: "center",
    gap: 8,
    padding: 28,
    borderRadius: radius.lg,
  },
  section: { gap: 10 },
  fill: { flex: 1 },
  separator: { height: 12 },
  stackSm: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center" },
});
