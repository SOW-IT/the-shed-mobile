import { CHAT_TTL_MS } from "@shared/world";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from "react-native";
import { gradientStyle } from "@/components/ui/Grid";
import type { Id } from "../../convex/_generated/dataModel";
import { chatLineParts } from "./chatFormat";
import { chatLog } from "./palette";
import { useWorldSetting } from "./settings";
import { useChatLog } from "./useChatLog";
import { PENDING } from "./useWorld";
import { saidLabel } from "./view";
import { scrollEdges, type ScrollEdges } from "./scrollEdges";
import { styledName } from "@shared/names";

const LINE_HEIGHT = 19;
const SHOWN_LINES = 5;
const END_SLACK = 6;
const PAD = 2;
const MOST = LINE_HEIGHT * SHOWN_LINES;
const FADE_HEIGHT = 18;

const fitWhole = (heights: readonly number[]) => {
  let total = 0;
  for (let i = heights.length - 1; i >= 0; i--) {
    if (total > 0 && total + heights[i] > MOST) break;
    total += heights[i];
  }
  return Math.min(MOST, total);
};

const blocky = Platform.select({
  ios: "Menlo",
  android: "monospace",
  default: "ui-monospace, Menlo, Consolas, monospace",
});

const HUD_CHAT_LIMIT = 30;

export const ChatLog = ({
  roomId,
  muted,
  serverNow,
  status,
  onLine,
}: {
  roomId: Id<"worldRooms"> | null;
  onLine: (memberId: Id<"worldMembers">, name: string) => void;
  muted: ReadonlySet<string>;
  serverNow: () => number;
  status: string | null;
}) => {
  const log = useChatLog(roomId, HUD_CHAT_LIMIT);
  const [times] = useWorldSetting("chatTimes");
  const [names] = useWorldSetting("names");
  const format = { times: times === "on", names };
  const [now, setNow] = useState(serverNow);
  const nextExpiry = (log ?? []).reduce<number | null>((soonest, line) => {
    const gone = line.at + CHAT_TTL_MS;
    return gone > now && (soonest === null || gone < soonest) ? gone : soonest;
  }, null);
  useEffect(() => {
    if (nextExpiry === null) return;
    const id = setTimeout(() => setNow(Math.max(nextExpiry, serverNow())), Math.max(0, nextExpiry - serverNow()) + 1);
    return () => clearTimeout(id);
  }, [nextExpiry, serverNow]);
  const scroller = useRef<ScrollViewInstance>(null);
  const atEnd = useRef(true);
  const frame = useRef({ offset: 0, content: 0, viewport: 0 });
  const [edges, setEdges] = useState<ScrollEdges>({ above: false, below: false });
  const showEdges = (next: Partial<typeof frame.current>) => {
    frame.current = { ...frame.current, ...next };
    const found = scrollEdges(frame.current, END_SLACK);
    setEdges((was) => (was.above === found.above && was.below === found.below ? was : found));
  };
  const [heights, setHeights] = useState<Record<string, number>>({});
  const lines = (log ?? []).filter((line) => !muted.has(line.memberId) && now - line.at < CHAT_TTL_MS).reverse();
  const showing = new Set(["status", ...lines.map((line) => line.id)]);
  const measure = (id: string) => (e: LayoutChangeEvent) => {
    const height = Math.round(e.nativeEvent.layout.height);
    setHeights((known) => {
      if (known[id] === height) return known;
      const kept: Record<string, number> = { [id]: height };
      for (const key of Object.keys(known)) if (key !== id && showing.has(key)) kept[key] = known[key];
      return kept;
    });
  };
  if (!status && lines.length === 0) return null;
  const shown = fitWhole([...(status ? [heights.status ?? LINE_HEIGHT] : []), ...lines.map((line) => heights[line.id] ?? LINE_HEIGHT)]);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEnd.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK;
    showEdges({ offset: contentOffset.y, content: contentSize.height, viewport: layoutMeasurement.height });
  };
  return (
    <View style={styles.frame}>
      <SharpScrollView
        ref={scroller}
        style={[styles.log, { maxHeight: shown + PAD * 2 }]}
        contentContainerStyle={styles.content}
        onScroll={onScroll}
        scrollEventThrottle={32}
        onContentSizeChange={(_width, height) => {
          if (atEnd.current) scroller.current?.scrollToEnd({ animated: false });
          showEdges(atEnd.current ? { content: height, offset: Math.max(0, height - frame.current.viewport) } : { content: height });
        }}
        onLayout={(e) => {
          if (atEnd.current) scroller.current?.scrollToEnd({ animated: false });
          const viewport = e.nativeEvent.layout.height;
          showEdges(atEnd.current ? { viewport, offset: Math.max(0, frame.current.content - viewport) } : { viewport });
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        accessibilityLabel="Chat"
        testID="world-chat-log"
      >
        {status ? (
          <Text style={[styles.line, styles.status]} onLayout={measure("status")} testID="world-chat-status">
            {status}
          </Text>
        ) : null}
        {lines.map((line) => {
          const parts = chatLineParts(line, { ...format, pending: line.id.startsWith(PENDING) });
          return line.kind ? (
            <Text key={line.id} style={[styles.line, styles.system]} onLayout={measure(line.id)} accessibilityLabel={saidLabel(line, names)} testID="world-chat-system">
              <ChatLineHead parts={parts} />
              {`${parts.name} ${parts.text}`}
            </Text>
          ) : (
            <Text
              key={line.id}
              style={styles.line}
              onLayout={measure(line.id)}
              accessibilityLabel={saidLabel(line, names)}
              accessibilityHint={line.isMe ? undefined : `Mute, block or report ${styledName(line.name, names)}`}
              onPress={line.isMe ? undefined : () => onLine(line.memberId, line.name)}
              suppressHighlighting
              testID="world-chat-line"
            >
              <ChatLineHead parts={parts} />
              <Text style={line.isMe ? styles.me : styles.name}>{`<${parts.name}> `}</Text>
              {line.text}
            </Text>
          );
        })}
      </SharpScrollView>
      {edges.above ? <View style={[styles.fade, styles.fadeTop, gradientStyle(`linear-gradient(to bottom, ${chatLog.fade}, transparent)`)]} pointerEvents="none" testID="world-chat-fade-top" /> : null}
      {edges.below ? <View style={[styles.fade, styles.fadeBottom, gradientStyle(`linear-gradient(to top, ${chatLog.fade}, transparent)`)]} pointerEvents="none" testID="world-chat-fade-bottom" /> : null}
    </View>
  );
};

const ChatLineHead = ({ parts }: { parts: ReturnType<typeof chatLineParts> }) => (
  <>
    {parts.time === null ? null : <Text style={styles.time}>[{parts.time}] </Text>}
    {parts.place === null ? null : <Text style={styles.place}>[{parts.place}] </Text>}
  </>
);

const shadow = {
  textShadowColor: chatLog.shadow,
  textShadowOffset: { width: 1.5, height: 1.5 },
  textShadowRadius: 0.01,
};

const styles = StyleSheet.create({
  frame: { maxWidth: "100%" },
  log: { flexGrow: 0, backgroundColor: chatLog.backing, borderRadius: 4 },
  fade: { position: "absolute", left: 0, right: 0, height: FADE_HEIGHT },
  fadeTop: { top: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  fadeBottom: { bottom: 0, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  content: { paddingTop: 0, paddingBottom: PAD * 2, paddingHorizontal: 6 },
  line: { fontFamily: blocky, fontSize: 13.5, lineHeight: LINE_HEIGHT, fontWeight: "700", color: chatLog.text, ...shadow },
  time: { color: chatLog.time },
  name: { color: chatLog.name },
  me: { color: chatLog.me },
  place: { color: chatLog.place },
  status: { color: chatLog.status },
  system: { color: chatLog.system },
});
