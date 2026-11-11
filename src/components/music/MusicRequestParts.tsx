import { Btn, Card, Sheet } from "@/components/ui";
import { releaseDateLabel, songServiceLabel } from "@shared/praiseList";
import { openExternalLink } from "@/lib/openExternalLink";
import { radius, spacing, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { useState } from "react";
import { Image, Pressable, Share, StyleSheet, Text, View } from "react-native";
import type { Doc } from "../../../convex/_generated/dataModel";

export type MusicRowActions = {
  onEditRequest?: (request: Doc<"musicRequests">) => void;
  onDeleteRequest?: (request: Doc<"musicRequests">) => void;
};

export type MusicRequest = Doc<"musicRequests"> & {
  requesterName?: string | null;
  reviewerName?: string | null;
};

export const shareLink = async (url: string) => {
  try {
    await Share.share({ message: url });
  } catch {
    // user cancelled or share failed
  }
};


/** Album art saved with the request; icon fallback for manual entries. */
export function SongArtwork({ url, size = 46 }: { url?: string; size?: number }) {
  const t = useAppTheme();
  const [failed, setFailed] = useState(false);
  return (
    <View
      style={[
        styles.musicArtwork,
        {
          width: size,
          height: size,
          backgroundColor: t.inputBackground,
        },
      ]}
    >
      {url && !failed ? (
        <Image
          source={{ uri: url }}
          style={{ width: size, height: size, borderRadius: radius.md }}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Ionicons name="musical-notes-outline" size={21} color={t.faint} />
      )}
    </View>
  );
}


export const PAGE_SIZE = 15;

export type RequestFilter = "ALL" | "PENDING" | "APPROVED" | "DECLINED";

export const formatDate = (timestamp?: number) =>
  timestamp
    ? new Date(timestamp).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

export function FilterChips({
  value,
  onChange,
  options,
}: {
  value: RequestFilter;
  onChange: (value: RequestFilter) => void;
  options: RequestFilter[];
}) {
  const t = useAppTheme();
  return (
    <View style={styles.filterRow}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option)}
            style={[
              styles.filterChip,
              { backgroundColor: selected ? t.primary : t.inputBackground },
            ]}
          >
            <Text
              style={[styles.filterText, { color: selected ? "#fff" : t.text }]}
            >
              {option === "ALL"
                ? "All"
                : option[0] + option.slice(1).toLowerCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatusPill({ status }: { status: MusicRequest["status"] }) {
  const t = useAppTheme();
  const chip =
    status === "APPROVED"
      ? t.chip.PAID
      : status === "DECLINED"
        ? t.chip.DECLINED
        : t.chip.default;
  const icon =
    status === "APPROVED"
      ? "checkmark-circle"
      : status === "DECLINED"
        ? "close-circle"
        : "time-outline";
  return (
    <View style={[styles.newStatusPill, { backgroundColor: chip.bg }]}>
      <Ionicons name={icon} size={13} color={chip.fg} />
      <Text style={[styles.newStatusText, { color: chip.fg }]}>
        {status === "PENDING"
          ? "Pending"
          : status === "APPROVED"
            ? "Approved"
            : "Declined"}
      </Text>
    </View>
  );
}

export function SongHeader({
  request,
  status = false,
}: {
  request: MusicRequest;
  status?: boolean;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.requestHeader}>
      <SongArtwork
        key={request.albumArtUrl ?? "no-artwork"}
        url={request.albumArtUrl}
        size={66}
      />
      <View style={styles.requestHeadingText}>
        <Text
          style={[styles.requestSongTitle, { color: t.text }]}
          numberOfLines={2}
        >
          {request.title}
        </Text>
        <Text style={{ color: t.faint, fontSize: 13 }} numberOfLines={2}>
          {request.artist}
        </Text>
      </View>
      {status ? <StatusPill status={request.status} /> : null}
    </View>
  );
}

export function DetailLine({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.detailLine}>
      <Ionicons name={icon} size={15} color={t.faint} />
      <Text style={{ color: t.faint, fontSize: 13, flex: 1 }}>{children}</Text>
    </View>
  );
}

function SongLink({ link }: { link: string }) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => void openExternalLink(link)}
      onLongPress={() => void shareLink(link)}
      style={styles.songLink}
    >
      <Ionicons name="open-outline" size={15} color={t.primary} />
      <Text style={{ color: t.primary, fontSize: 13, fontWeight: "700" }}>
        Open song
      </Text>
    </Pressable>
  );
}

const formatMoment = (timestamp?: number) =>
  timestamp
    ? new Date(timestamp).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

function TrailStep({
  icon,
  title,
  when,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  when?: string;
}) {
  const t = useAppTheme();
  return (
    <View style={styles.trailStep}>
      <Ionicons name={icon} size={18} color={t.primary} />
      <View style={styles.textColumn}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: "600" }}>
          {title}
        </Text>
        {when ? (
          <Text style={{ color: t.faint, fontSize: 12 }}>{when}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function SongDetailsSheet({
  request,
  onClose,
}: {
  request: MusicRequest | null;
  onClose: () => void;
}) {
  const t = useAppTheme();
  const [last, setLast] = useState<MusicRequest | null>(request);
  if (request && request !== last) setLast(request);
  const song = request ?? last;
  const requester = song ? (song.requesterName ?? song.requesterEmail) : "";
  const reviewer = song?.reviewedByEmail
    ? (song.reviewerName ?? song.reviewedByEmail)
    : null;
  const addedDirectly =
    !!song &&
    song.status === "APPROVED" &&
    song.reviewedByEmail?.toLowerCase() === song.requesterEmail.toLowerCase();
  const released = releaseDateLabel(song?.releaseDate);
  return (
    <Sheet
      visible={request !== null}
      onClose={onClose}
      title="Song details"
      footer={
        song?.link ? (
          <View style={styles.stackSm}>
            <Btn
              title={songServiceLabel(song.link)}
              icon="open-outline"
              onPress={() => void openExternalLink(song.link)}
            />
            <Btn
              title="Share link"
              icon="share-outline"
              variant="ghost"
              onPress={() => void shareLink(song.link)}
            />
          </View>
        ) : undefined
      }
    >
      {song ? (
        <View style={styles.stackMd}>
          <SongHeader request={song} status />
          {released ? (
            <DetailLine icon="disc-outline">Released {released}</DetailLine>
          ) : null}
          <View style={styles.stackSm}>
            <Text style={[styles.noteLabel, { color: t.faint }]}>HISTORY</Text>
            <TrailStep
              icon="add-circle-outline"
              title={
                addedDirectly
                  ? `Added to the list by ${requester}`
                  : `Suggested by ${requester}`
              }
              when={formatMoment(song._creationTime)}
            />
            {song.status === "PENDING" ? (
              <TrailStep icon="time-outline" title="Waiting for a Praise Manager" />
            ) : null}
            {song.status !== "PENDING" && !addedDirectly ? (
              <TrailStep
                icon={
                  song.status === "APPROVED"
                    ? "checkmark-circle-outline"
                    : "close-circle-outline"
                }
                title={`${song.status === "APPROVED" ? "Approved" : "Declined"}${
                  reviewer ? ` by ${reviewer}` : ""
                }`}
                when={formatMoment(song.reviewedTime)}
              />
            ) : null}
          </View>
          {song.requestComment?.trim() ? (
            <View style={styles.trailText}>
              <Text style={[styles.noteLabel, { color: t.faint }]}>
                REQUEST NOTE
              </Text>
              <Text style={{ color: t.text, fontSize: 14, lineHeight: 21 }}>
                {song.requestComment}
              </Text>
            </View>
          ) : null}
          {song.status === "DECLINED" && song.declineComment ? (
            <View
              style={[styles.commentBox, { backgroundColor: t.inputBackground }]}
            >
              <Text style={{ color: t.danger, fontSize: 12, fontWeight: "700" }}>
                Decline reason
              </Text>
              <Text style={{ color: t.text, fontSize: 13 }}>
                {song.declineComment}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}

export function MyRequestCard({
  request,
  actions,
  footer,
  showRequester = false,
  onPress,
}: {
  request: MusicRequest;
  actions?: ReactNode;
  footer?: ReactNode;
  showRequester?: boolean;
  onPress?: () => void;
}) {
  const t = useAppTheme();
  const date =
    request.status === "PENDING" ? request._creationTime : request.reviewedTime;
  return (
    <Card>
      <View style={styles.requestCardContent}>
        <View style={styles.row}>
          <View style={styles.fill}>
            <SongCardPress request={request} onPress={onPress}>
              <SongHeader request={request} status />
            </SongCardPress>
          </View>
          {actions}
        </View>
        {showRequester ? (
          <DetailLine icon="person-outline">
            Requested by {request.requesterName ?? request.requesterEmail}
          </DetailLine>
        ) : null}
        <DetailLine icon="calendar-outline">
          {request.status === "PENDING"
            ? "Requested"
            : request.status === "APPROVED"
              ? "Approved"
              : "Declined"}{" "}
          {formatDate(date)}
        </DetailLine>
        {request.status !== "PENDING" && request.reviewedByEmail ? (
          <DetailLine icon="person-outline">
            {request.status === "APPROVED" ? "Approved" : "Declined"} by{" "}
            {request.reviewerName ?? request.reviewedByEmail}
          </DetailLine>
        ) : null}
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
        {request.status === "DECLINED" && request.declineComment ? (
          <View
            style={[styles.commentBox, { backgroundColor: t.inputBackground }]}
          >
            <Text style={{ color: t.danger, fontSize: 12, fontWeight: "700" }}>
              Decline reason
            </Text>
            <Text style={{ color: t.text, fontSize: 13 }}>
              {request.declineComment}
            </Text>
          </View>
        ) : null}
        <SongLinks link={request.link} onHistory={onPress} />
        {footer}
      </View>
    </Card>
  );
}

export function SongLinks({
  link,
  onHistory,
}: {
  link?: string;
  onHistory?: () => void;
}) {
  const t = useAppTheme();
  if (!link && !onHistory) return null;
  return (
    <View style={styles.songLinks}>
      {link ? <SongLink link={link} /> : null}
      {onHistory ? (
        <Pressable
          accessibilityRole="button"
          onPress={onHistory}
          style={styles.songLink}
        >
          <Ionicons name="time-outline" size={15} color={t.primary} />
          <Text style={{ color: t.primary, fontSize: 13, fontWeight: "700" }}>
            History
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function SongCardPress({
  request,
  onPress,
  children,
}: {
  request: MusicRequest;
  onPress?: () => void;
  children: ReactNode;
}) {
  if (!onPress) return <>{children}</>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${request.title} by ${request.artist}, details`}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.8 }}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radius.full,
  },
  filterText: { fontSize: 12, fontWeight: "700" },
  requestCardContent: { gap: 12 },
  requestHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  requestHeadingText: { flex: 1, gap: 4, minWidth: 0 },
  requestSongTitle: { fontSize: 15, fontWeight: "800" },
  newStatusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  newStatusText: { fontSize: 10, fontWeight: "800" },
  detailLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  trailStep: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  songLinks: { flexDirection: "row", flexWrap: "wrap", gap: spacing.lg },
  noteLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  commentBox: { padding: 12, borderRadius: radius.md, gap: 6 },
  songLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 3,
  },
  musicArtwork: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  fill: { flex: 1 },
  textColumn: { flex: 1, gap: 2 },
  stackSm: { gap: spacing.sm },
  stackMd: { gap: spacing.md },
  trailText: { gap: 5 },
  row: { flexDirection: "row", alignItems: "center" },
});
