import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../convex/_generated/api";
import {
  emptyHomeBlock,
  HOME_BLOCK_LABELS,
  HOME_ICONS,
  type HomeBlock,
  type HomeBlockType,
  type HomeButton,
  type HomeCampus,
  type HomeLink,
  type HomeSocial,
} from "../../shared/homeContent";
import { HomeBlocks } from "@/components/home/HomeBlocks";
import {
  Btn,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  errorMessage,
  Field,
  FooterAction,
  InfoBanner,
  LoadingState,
  Muted,
  OptionRow,
  OptionSheet,
  Screen,
  Segmented,
  Select,
} from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";

type Keyed = { id: number; block: HomeBlock };

const ICON_OPTIONS = HOME_ICONS.map((icon) => ({ label: icon.replace(/-outline$/, "").replace(/^logo-/, ""), value: icon }));

const ADDABLE: HomeBlockType[] = ["heading", "text", "card", "links", "socials", "campuses", "hero", "contact"];

export default function EditHomeScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const view = useQuery(api.homeContent.view);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/home"));

  if (view === undefined) return <LoadingState />;
  const current = view.tabs.find((t) => t.key === tab) ?? view.tabs[0];
  if (!view.canEdit || !current) {
    return (
      <Screen title="Edit Home" onBack={back}>
        <EmptyState
          icon="lock-closed-outline"
          title="You can't edit Home"
          message="Only admins and Marketing staff can edit the Home tab."
        />
      </Screen>
    );
  }
  return (
    <Editor
      key={current.key}
      tabKey={current.key}
      label={current.label}
      initial={current.blocks}
      edited={current.edited}
      onDone={back}
    />
  );
}

function Editor({
  tabKey,
  label,
  initial,
  edited,
  onDone,
}: {
  tabKey: string;
  label: string;
  initial: HomeBlock[];
  edited: { at: number; by: string } | null;
  onDone: () => void;
}) {
  const save = useMutation(api.homeContent.save);
  const reset = useMutation(api.homeContent.reset);
  const nextId = useRef(initial.length);
  const [items, setItems] = useState<Keyed[]>(() => initial.map((block, id) => ({ id, block })));
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [baseUpdatedAt] = useState(edited?.at ?? null);

  const change = (next: Keyed[]) => {
    setItems(next);
    setDirty(true);
  };
  const updateAt = (index: number, block: HomeBlock) =>
    change(items.map((item, i) => (i === index ? { ...item, block } : item)));
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    change(next);
  };
  const remove = (index: number) => change(items.filter((_, i) => i !== index));
  const add = (type: HomeBlockType) => {
    change([...items, { id: nextId.current++, block: emptyHomeBlock(type) }]);
    setAdding(false);
  };

  const onSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await save({ tab: tabKey, blocks: items.map((item) => item.block), baseUpdatedAt });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const onReset = async () => {
    setConfirmReset(false);
    setError(null);
    try {
      await reset({ tab: tabKey });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const leave = () => (dirty ? setConfirmDiscard(true) : onDone());

  return (
    <Screen
      title={`Edit ${label}`}
      subtitle="Home"
      onBack={leave}
      maxWidth={720}
      footer={
        <FooterAction
          title={saving ? "Saving…" : "Save"}
          onPress={() => void onSave()}
          disabled={saving || !dirty}
          cancel={{ onPress: leave, disabled: saving }}
        />
      }
    >
      <View style={styles.page}>
        <InfoBanner message="Changes show for everyone using THE SHED as soon as you save." />
        {edited ? (
          <Muted>
            Last saved by {edited.by} on {new Date(edited.at).toLocaleString("en-AU")}.
          </Muted>
        ) : (
          <Muted>This tab is showing the built-in content.</Muted>
        )}
        <Segmented
          segments={[
            { key: "edit", label: "Edit" },
            { key: "preview", label: "Preview" },
          ]}
          active={mode}
          onChange={setMode}
        />
        <ErrorBanner message={error} />
        {mode === "preview" ? (
          <HomeBlocks blocks={items.map((item) => item.block)} />
        ) : (
          <>
            {items.map((item, index) => (
              <BlockEditor
                key={item.id}
                block={item.block}
                position={index}
                count={items.length}
                onChange={(block) => updateAt(index, block)}
                onMove={(by) => move(index, by)}
                onRemove={() => remove(index)}
              />
            ))}
            <Btn title="Add section" variant="tonal" icon="add" onPress={() => setAdding(true)} />
            {edited ? (
              <Btn
                title="Restore built-in content"
                variant="ghost"
                icon="refresh"
                onPress={() => setConfirmReset(true)}
              />
            ) : null}
          </>
        )}
      </View>

      <OptionSheet visible={adding} title="Add section" onClose={() => setAdding(false)}>
        {ADDABLE.map((type) => (
          <OptionRow key={type} label={HOME_BLOCK_LABELS[type]} selected={false} onPress={() => add(type)} />
        ))}
      </OptionSheet>
      <ConfirmDialog
        visible={confirmReset}
        title={`Restore ${label}?`}
        message="This replaces everyone's view of this tab with the built-in content. Your edits to it will be lost."
        confirmLabel="Restore"
        onConfirm={() => void onReset()}
        onClose={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        visible={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved changes to this tab."
        confirmLabel="Discard"
        onConfirm={() => {
          setConfirmDiscard(false);
          onDone();
        }}
        onClose={() => setConfirmDiscard(false)}
      />
    </Screen>
  );
}

function BlockEditor({
  block,
  position,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  block: HomeBlock;
  position: number;
  count: number;
  onChange: (block: HomeBlock) => void;
  onMove: (by: number) => void;
  onRemove: () => void;
}) {
  const t = useAppTheme();
  return (
    <Card>
      <View style={styles.blockHeader}>
        <Text style={[typography.label, { color: t.muted, flex: 1 }]}>
          {position + 1}. {HOME_BLOCK_LABELS[block.type]}
        </Text>
        <SmallIcon name="arrow-up" label="Move up" disabled={position === 0} onPress={() => onMove(-1)} />
        <SmallIcon name="arrow-down" label="Move down" disabled={position === count - 1} onPress={() => onMove(1)} />
        <SmallIcon name="trash-outline" label="Remove section" danger onPress={onRemove} />
      </View>
      <BlockFields block={block} onChange={onChange} />
    </Card>
  );
}

function BlockFields({ block, onChange }: { block: HomeBlock; onChange: (block: HomeBlock) => void }) {
  switch (block.type) {
    case "hero":
      return (
        <>
          <Field label="Small heading" value={block.eyebrow} autoCapitalize="sentences" onChangeText={(eyebrow) => onChange({ ...block, eyebrow })} />
          <Field label="Headline" value={block.text} autoCapitalize="sentences" multiline onChangeText={(text) => onChange({ ...block, text })} />
        </>
      );
    case "heading":
      return <Field label="Heading" value={block.text} autoCapitalize="sentences" onChangeText={(text) => onChange({ ...block, text })} />;
    case "text":
      return <Field label="Text" value={block.text} autoCapitalize="sentences" multiline onChangeText={(text) => onChange({ ...block, text })} />;
    case "contact":
      return (
        <>
          <Field label="Title" value={block.title} autoCapitalize="sentences" onChangeText={(title) => onChange({ ...block, title })} />
          <Field label="Text above the form" value={block.body} autoCapitalize="sentences" multiline onChangeText={(body) => onChange({ ...block, body })} />
        </>
      );
    case "card":
      return <CardFields block={block} onChange={onChange} />;
    case "links":
      return (
        <ItemList
          items={block.links}
          noun="link"
          empty={(): HomeLink => ({ name: "", url: "" })}
          onChange={(links) => onChange({ ...block, links })}
          render={(link, set) => (
            <>
              <Field label="Name" value={link.name} autoCapitalize="sentences" onChangeText={(name) => set({ ...link, name })} />
              <Field label="Link (web, email or tel:number)" value={link.url} onChangeText={(url) => set({ ...link, url })} placeholder="https://… or tel:131114" />
              <Field label="Small text under the name (optional)" value={link.note ?? ""} onChangeText={(note) => set({ ...link, note })} />
            </>
          )}
        />
      );
    case "socials":
      return (
        <>
          <Field label="Caption" value={block.caption} onChangeText={(caption) => onChange({ ...block, caption })} />
          <ItemList
            items={block.links}
            noun="button"
            empty={(): HomeSocial => ({ label: "", icon: "globe-outline", url: "" })}
            onChange={(links) => onChange({ ...block, links })}
            render={(social, set) => (
              <>
                <Field label="Name" value={social.label} autoCapitalize="words" onChangeText={(label) => set({ ...social, label })} />
                <Select label="Icon" value={social.icon} options={ICON_OPTIONS} onSelect={(icon) => set({ ...social, icon })} />
                <Field label="Link" value={social.url} onChangeText={(url) => set({ ...social, url })} placeholder="https://…" />
              </>
            )}
          />
        </>
      );
    case "campuses":
      return (
        <ItemList
          items={block.campuses}
          noun="campus"
          empty={(): HomeCampus => ({ name: "", short: "", about: "", meetingLabel: "Weekly Meeting", meeting: "", programs: [], instagram: "" })}
          onChange={(campuses) => onChange({ ...block, campuses })}
          render={(campus, set) => (
            <>
              <Field label="University name" value={campus.name} autoCapitalize="words" onChangeText={(name) => set({ ...campus, name })} />
              <Field label="One-line summary" value={campus.short} autoCapitalize="sentences" onChangeText={(short) => set({ ...campus, short })} />
              <Field label="About (blank line between paragraphs)" value={campus.about} autoCapitalize="sentences" multiline onChangeText={(about) => set({ ...campus, about })} />
              <Field label="Meeting heading" value={campus.meetingLabel} autoCapitalize="words" onChangeText={(meetingLabel) => set({ ...campus, meetingLabel })} />
              <Field label="Meeting details" value={campus.meeting} autoCapitalize="sentences" multiline onChangeText={(meeting) => set({ ...campus, meeting })} />
              <Field
                label="Programs (one per line)"
                value={campus.programs.join("\n")}
                autoCapitalize="sentences"
                multiline
                onChangeText={(text) => set({ ...campus, programs: text.split("\n") })}
              />
              <Field label="Instagram handle" value={campus.instagram} onChangeText={(instagram) => set({ ...campus, instagram })} placeholder="sowusyd" />
            </>
          )}
        />
      );
    default:
      return null;
  }
}

const MARKER_NONE = "none";
const MARKER_DOT = "dot";

function CardFields({
  block,
  onChange,
}: {
  block: Extract<HomeBlock, { type: "card" }>;
  onChange: (block: HomeBlock) => void;
}) {
  const marker = block.icon ?? (block.dot ? MARKER_DOT : MARKER_NONE);
  const setMarker = (value: string) => {
    const { icon: _icon, dot: _dot, ...rest } = block;
    if (value === MARKER_NONE) onChange(rest);
    else if (value === MARKER_DOT) onChange({ ...rest, dot: true });
    else onChange({ ...rest, icon: value });
  };
  return (
    <>
      <Field label="Title (optional)" value={block.title} autoCapitalize="sentences" onChangeText={(title) => onChange({ ...block, title })} />
      <Field label="Text (blank line between paragraphs)" value={block.body} autoCapitalize="sentences" multiline onChangeText={(body) => onChange({ ...block, body })} />
      <Select
        label="Mark beside the title"
        value={marker}
        options={[{ label: "None", value: MARKER_NONE }, { label: "Dot", value: MARKER_DOT }, ...ICON_OPTIONS]}
        onSelect={setMarker}
      />
      <Field
        label="Campus logo beside the title (optional university name)"
        value={block.campus ?? ""}
        autoCapitalize="words"
        onChangeText={(campus) => onChange({ ...block, campus })}
      />
      <Segmented
        segments={[
          { key: "default", label: "Plain card" },
          { key: "primary", label: "Highlighted" },
        ]}
        active={block.tone ?? "default"}
        onChange={(tone) => onChange({ ...block, tone: tone as "default" | "primary" })}
      />
      <ItemList
        items={block.buttons}
        noun="button"
        empty={(): HomeButton => ({ label: "", url: "", style: "tonal" })}
        onChange={(buttons) => onChange({ ...block, buttons })}
        render={(button, set) => (
          <>
            <Field label="Button text" value={button.label} autoCapitalize="sentences" onChangeText={(label) => set({ ...button, label })} />
            <Field label="Link (web, email or tel:number)" value={button.url} onChangeText={(url) => set({ ...button, url })} placeholder="https://…" />
            <Segmented
              segments={[
                { key: "primary", label: "Solid" },
                { key: "tonal", label: "Soft" },
                { key: "ghost", label: "Plain" },
              ]}
              active={button.style}
              onChange={(style) => set({ ...button, style: style as HomeButton["style"] })}
            />
          </>
        )}
      />
    </>
  );
}

function ItemList<T>({
  items,
  noun,
  empty,
  onChange,
  render,
}: {
  items: T[];
  noun: string;
  empty: () => T;
  onChange: (items: T[]) => void;
  render: (item: T, set: (item: T) => void) => ReactNode;
}) {
  const t = useAppTheme();
  const set = (index: number, item: T) => onChange(items.map((it, i) => (i === index ? item : it)));
  const move = (index: number, by: number) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };
  return (
    <View style={{ gap: spacing.sm }}>
      {items.map((item, index) => (
        <View key={index} style={[styles.item, { borderColor: t.border }]}>
          <View style={styles.blockHeader}>
            <Text style={[typography.caption, { color: t.muted, flex: 1, fontWeight: "700" }]}>
              {noun[0].toUpperCase() + noun.slice(1)} {index + 1}
            </Text>
            <SmallIcon name="arrow-up" label={`Move ${noun} up`} disabled={index === 0} onPress={() => move(index, -1)} />
            <SmallIcon name="arrow-down" label={`Move ${noun} down`} disabled={index === items.length - 1} onPress={() => move(index, 1)} />
            <SmallIcon name="close" label={`Remove ${noun}`} danger onPress={() => onChange(items.filter((_, i) => i !== index))} />
          </View>
          {render(item, (next) => set(index, next))}
        </View>
      ))}
      <Btn title={`Add ${noun}`} variant="ghost" icon="add" onPress={() => onChange([...items, empty()])} />
    </View>
  );
}

function SmallIcon({
  name,
  label,
  onPress,
  disabled,
  danger,
}: {
  name: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallIcon,
        { backgroundColor: danger ? t.dangerSoft : t.ghost, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
      ]}
    >
      <Ionicons name={name} size={16} color={danger ? t.danger : t.ghostText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.md },
  blockHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  item: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  smallIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
