import { CHAT_TTL_MS, isPlace, PLACE_TITLES } from "@shared/world";
import { useQuery } from "convex/react";
import { useRef } from "react";
import { Platform, ScrollView, StyleSheet, Text, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { chatLog } from "./palette";
import { PENDING } from "./useWorld";
import { clock, saidLabel, systemLine } from "./view";

const LINE_HEIGHT = 19;
const SHOWN_LINES = 5;
const END_SLACK = 6;

const placeTag = (place: string | undefined) => (place && isPlace(place) ? PLACE_TITLES[place].replace(/^The /, "") : "Elsewhere");

const blocky = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, Menlo, Consolas, monospace",
});

export const ChatLog = ({
  roomId,
  muted,
  now,
  status,
  onLine,
}: {
  roomId: Id<"worldRooms"> | null;
  onLine: (memberId: Id<"worldMembers">, name: string) => void;
  muted: ReadonlySet<string>;
  now: number;
  status: string | null;
}) => {
  const log = useQuery(api.world.chatLog, roomId ? { roomId } : "skip");
  const scroller = useRef<ScrollViewInstance>(null);
  const atEnd = useRef(true);
  const lines = (log ?? []).filter((line) => !muted.has(line.memberId) && now - line.at < CHAT_TTL_MS).reverse();
  if (!status && lines.length === 0) return null;
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK;
  };
  return (
    <ScrollView
      ref={scroller}
      style={styles.log}
      contentContainerStyle={styles.content}
      onScroll={onScroll}
      scrollEventThrottle={32}
      onContentSizeChange={() => {
        if (atEnd.current) scroller.current?.scrollToEnd({ animated: false });
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel="Chat"
      testID="world-chat-log"
    >
      {status ? (
        <Text style={[styles.line, styles.status]} testID="world-chat-status">
          {status}
        </Text>
      ) : null}
      {lines.map((line) =>
        line.kind ? (
          <Text key={line.id} style={[styles.line, styles.system]} accessibilityLabel={saidLabel(line)} testID="world-chat-system">
            <Text style={styles.time}>[{clock(line.at)}] </Text>
            {line.here ? null : <Text style={styles.place}>[{placeTag(line.place)}] </Text>}
            {systemLine(line)}
          </Text>
        ) : (
          <Text
            key={line.id}
            style={styles.line}
            accessibilityLabel={saidLabel(line)}
            accessibilityHint={line.isMe ? undefined : `Mute, block or report ${line.name}`}
            onPress={line.isMe ? undefined : () => onLine(line.memberId, line.name)}
            suppressHighlighting
            testID="world-chat-line"
          >
            <Text style={styles.time}>[{line.id.startsWith(PENDING) ? "…" : clock(line.at)}] </Text>
            {line.here ? null : <Text style={styles.place}>[{placeTag(line.place)}] </Text>}
            <Text style={line.isMe ? styles.me : styles.name}>{`<${line.name}> `}</Text>
            {line.text}
          </Text>
        )
      )}
    </ScrollView>
  );
};

const shadow = {
  textShadowColor: chatLog.shadow,
  textShadowOffset: { width: 1.5, height: 1.5 },
  textShadowRadius: 0.01,
};

const styles = StyleSheet.create({
  log: { maxHeight: LINE_HEIGHT * SHOWN_LINES + 4, flexGrow: 0 },
  content: { paddingVertical: 2 },
  line: { fontFamily: blocky, fontSize: 13.5, lineHeight: LINE_HEIGHT, fontWeight: "700", color: chatLog.text, ...shadow },
  time: { color: chatLog.time },
  name: { color: chatLog.name },
  me: { color: chatLog.me },
  place: { color: chatLog.place },
  status: { color: chatLog.status },
  system: { color: chatLog.system },
});
