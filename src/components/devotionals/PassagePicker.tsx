import { hapticSelect, Muted, OptionRow, OptionSheet, SearchField } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BIBLE_BOOKS,
  type BibleBook,
  chooseBook,
  chooseChapter,
  chooseFromVerse,
  chooseToChapter,
  chooseToVerse,
  OLD_TESTAMENT_BOOKS,
  type PassagePick,
  parseBibleReference,
  passageFromPick,
  passageFromPicks,
  picksFromPassage,
  searchBibleBooks,
  versesInChapter,
} from "@shared/bible";
import { canAddPassage, MAX_PASSAGE_LENGTH, PASSAGE_TOO_LONG_TEXT, passageEditFits } from "@shared/devotionals";
import { type ReactNode, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Step = "book" | "chapter" | "toChapter" | "from" | "to";

const NEW_TESTAMENT_START = BIBLE_BOOKS[OLD_TESTAMENT_BOOKS];

const PickerFace = ({
  label,
  value,
  placeholder,
  onPress,
  disabled,
  testID,
  inRow,
  prefix,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
  inRow?: boolean;
  /** A word shown inside the box before the value ("from", "to"), in place of a label above it. */
  prefix?: string;
}) => {
  const t = useAppTheme();
  return (
    <View style={[styles.face, inRow && styles.faceInRow]}>
      {prefix ? null : <Text style={[typography.label, { color: t.muted }]}>{label}</Text>}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? (placeholder === "–" ? "not chosen" : placeholder)}`}
        accessibilityHint="Opens a list to choose from"
        accessibilityState={{ disabled }}
        testID={testID}
        style={({ pressed }) => [
          styles.faceButton,
          { backgroundColor: t.inputBackground },
          disabled && { opacity: 0.6 },
          !disabled && pressed && { opacity: 0.7 },
        ]}
      >
        {prefix ? <Text style={[typography.caption, { color: t.muted }]}>{prefix}</Text> : null}
        <Text numberOfLines={1} style={[typography.body, { color: value ? t.text : t.faint, flex: 1 }]}>
          {value ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={t.faint} />
      </Pressable>
    </View>
  );
};

const NumberGrid = ({
  from,
  to,
  selected,
  noun,
  onPick,
}: {
  from: number;
  to: number;
  selected: number | null;
  noun: string;
  onPick: (n: number) => void;
}) => {
  const t = useAppTheme();
  const numbers = Array.from({ length: Math.max(to - from + 1, 0) }, (_, i) => from + i);
  return (
    <View style={styles.grid}>
      {numbers.map((n) => {
        const on = n === selected;
        return (
          <Pressable
            key={n}
            onPress={() => onPick(n)}
            accessibilityRole="button"
            accessibilityLabel={on ? `${noun} ${n}, selected` : `${noun} ${n}`}
            testID={`passage-${noun.toLowerCase()}-${n}`}
            style={({ pressed }) => [
              styles.cell,
              { backgroundColor: on ? t.primary : t.inputBackground },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[typography.body, styles.cellText, { color: on ? t.onPrimary : t.text }]}>{n}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const BookList = ({
  query,
  selected,
  onPick,
}: {
  query: string;
  selected: BibleBook | null;
  onPick: (book: BibleBook) => void;
}) => {
  const t = useAppTheme();
  const books = searchBibleBooks(query);
  if (books.length === 0) return <Muted>No book matches “{query.trim()}”.</Muted>;
  return books.map((book) => (
    <View key={book.name}>
      {book === BIBLE_BOOKS[0] || book === NEW_TESTAMENT_START ? (
        <Text
          accessibilityRole="header"
          style={[typography.label, styles.groupHeader, { color: t.muted }]}
        >
          {book === BIBLE_BOOKS[0] ? "Old Testament" : "New Testament"}
        </Text>
      ) : null}
      <OptionRow
        label={book.name}
        detail={book.chapters.length === 1 ? "1 chapter" : `${book.chapters.length} chapters`}
        selected={book === selected}
        onPress={() => onPick(book)}
      />
    </View>
  ));
};

const chapterLabel = (pick: PassagePick) =>
  pick.chapter === null ? pick.book.name : `${pick.book.singular ?? pick.book.name} ${pick.chapter}`;

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** How long a row's passage is ("3 chapters", "7 verses"), or null before a chapter is chosen. */
const rangeSize = (pick: PassagePick): string | null => {
  if (pick.chapter === null) return null;
  if (pick.fromVerse !== null) return plural(pick.toVerse === null ? 1 : pick.toVerse - pick.fromVerse + 1, "verse");
  if (pick.toChapter !== null) return plural(pick.toChapter - pick.chapter + 1, "chapter");
  return plural(versesInChapter(pick), "verse");
};

/** Row 1 keeps the test ids it always had; later rows add their number. */
const rowId = (id: string, row: number) => (row === 0 ? id : `${id}-${row + 1}`);

/** A from → to pair of boxes under a small heading: the chapters, or the verses, of a row. */
const RangeRow = ({ label, from, to }: { label: string; from: ReactNode; to: ReactNode }) => {
  const t = useAppTheme();
  return (
    <View style={styles.face}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
      <View style={styles.row}>
        {from}
        <Ionicons name="arrow-forward" size={16} color={t.faint} style={styles.arrow} />
        {to}
      </View>
    </View>
  );
};

const PickRow = ({
  pick,
  row,
  rows,
  editable,
  onOpen,
  onRemove,
}: {
  pick: PassagePick | null;
  row: number;
  rows: number;
  editable: boolean;
  onOpen: (step: Step) => void;
  onRemove: () => void;
}) => {
  const t = useAppTheme();
  const oneChapter = pick?.book.chapters.length === 1;
  const verses = pick ? versesInChapter(pick) : 0;
  const laterChapters = pick?.chapter != null && pick.chapter < pick.book.chapters.length;
  const size = pick ? rangeSize(pick) : null;
  return (
    <View style={[styles.wrap, row > 0 && [styles.laterRow, { borderTopColor: t.border }]]}>
      {rows > 1 ? (
        <View style={styles.rowHeader}>
          <View style={styles.rowTitle}>
            <View style={[styles.badge, { backgroundColor: t.primarySoft }]}>
              <Text style={[typography.label, { color: t.primary }]}>{row + 1}</Text>
            </View>
            <Text
              numberOfLines={1}
              accessibilityLabel={`Passage ${row + 1}${pick ? `, ${passageFromPick(pick)}` : ""}${size ? `, ${size}` : ""}`}
              style={[typography.label, styles.rowTitleText, { color: pick ? t.text : t.muted }]}
            >
              {pick ? passageFromPick(pick) : `Passage ${row + 1}`}
            </Text>
            {size ? (
              <Text numberOfLines={1} importantForAccessibility="no" style={[typography.caption, styles.rowSize, { color: t.muted }]}>
                {size}
              </Text>
            ) : null}
          </View>
          {editable ? (
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              accessibilityLabel={`Remove passage ${row + 1}`}
              testID={rowId("devotional-passage-remove", row)}
              style={({ pressed }) => [styles.switch, styles.removeButton, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close-circle-outline" size={22} color={t.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <PickerFace
        label="Book"
        value={pick?.book.name ?? null}
        placeholder="Choose a book"
        onPress={() => onOpen("book")}
        disabled={!editable}
        testID={rowId("devotional-passage-book", row)}
      />
      {oneChapter ? null : (
        <RangeRow
          label="Chapters"
          from={
            <PickerFace
              label="From chapter"
              prefix="from"
              value={pick?.chapter == null ? null : String(pick.chapter)}
              placeholder="–"
              onPress={() => onOpen("chapter")}
              disabled={!editable || !pick}
              testID={rowId("devotional-passage-chapter", row)}
              inRow
            />
          }
          to={
            <PickerFace
              label="To chapter"
              prefix="to"
              value={pick?.toChapter == null ? null : String(pick.toChapter)}
              placeholder={pick?.chapter == null ? "–" : `${pick.chapter} only`}
              onPress={() => onOpen("toChapter")}
              disabled={!editable || !laterChapters}
              testID={rowId("devotional-passage-to-chapter", row)}
              inRow
            />
          }
        />
      )}
      <RangeRow
        label="Verses"
        from={
          <PickerFace
            label="From verse"
            prefix="from"
            value={pick?.fromVerse == null ? null : String(pick.fromVerse)}
            placeholder={verses ? "All" : "–"}
            onPress={() => onOpen("from")}
            disabled={!editable || !verses}
            testID={rowId("devotional-passage-from", row)}
            inRow
          />
        }
        to={
          <PickerFace
            label="To verse"
            prefix="to"
            value={pick?.toVerse == null ? null : String(pick.toVerse)}
            placeholder={pick?.fromVerse == null ? "–" : `${pick.fromVerse} only`}
            onPress={() => onOpen("to")}
            disabled={!editable || pick?.fromVerse == null || pick.fromVerse >= verses}
            testID={rowId("devotional-passage-to", row)}
            inRow
          />
        }
      />
    </View>
  );
};

/**
 * The devotional's passages as books, chapters and verse ranges picked from
 * lists, one row each. The stored text is unchanged: picks are written the
 * way a typed reference is saved ("Genesis 1-3; Psalm 1"), and a saved
 * reference the rows can't show (a verse range across chapters) stays in the
 * typed box.
 */
export const PassagePicker = ({
  passage,
  onChange,
  editable,
  invalid,
}: {
  passage: string;
  onChange: (passage: string) => void;
  editable: boolean;
  invalid: boolean;
}) => {
  const t = useAppTheme();
  const read = picksFromPassage(passage);
  const [typingChosen, setTypingChosen] = useState(false);
  const typing = typingChosen || read === "custom";
  const [open, setOpen] = useState<{ row: number; step: Step } | null>(null);
  const [query, setQuery] = useState("");
  const [tooLong, setTooLong] = useState(false);
  const picks = read === "custom" ? [] : (read ?? []);

  const close = () => {
    setOpen(null);
    setQuery("");
  };
  /**
   * Sets the row's pick, or removes the row for `null`. A row past the end is
   * a new one. A change that would take the passage over the length limit is
   * refused: the sheet closes and says why. Returns whether it was written.
   */
  const write = (row: number, next: PassagePick | null): boolean => {
    const nextPicks = [...picks];
    if (next) nextPicks[row] = next;
    else nextPicks.splice(row, 1);
    const nextPassage = passageFromPicks(nextPicks);
    if (!passageEditFits(nextPassage, passage)) {
      setTooLong(true);
      close();
      return false;
    }
    hapticSelect();
    setTooLong(false);
    onChange(nextPassage);
    return true;
  };

  if (typing) {
    const canUseLists = read !== "custom";
    const valid = passage.trim().length > 0 && parseBibleReference(passage).ok;
    return (
      <View style={styles.wrap}>
        <TextInput
          value={passage}
          onChangeText={(value) => {
            setTypingChosen(true);
            onChange(value);
          }}
          placeholder="Psalm 23 or John 15:1-17"
          placeholderTextColor={t.faint}
          maxLength={MAX_PASSAGE_LENGTH}
          autoCorrect={false}
          editable={editable}
          accessibilityLabel="Passage reference"
          testID="devotional-passage-input"
          style={[
            styles.typed,
            typography.body,
            {
              color: t.text,
              backgroundColor: t.inputBackground,
              borderColor: invalid ? t.danger : t.border,
            },
          ]}
        />
        {canUseLists ? (
          <Pressable
            onPress={() => setTypingChosen(false)}
            disabled={!editable}
            accessibilityRole="button"
            testID="devotional-passage-use-lists"
            hitSlop={8}
            style={({ pressed }) => [styles.switch, pressed && { opacity: 0.6 }]}
          >
            <Ionicons name="list-outline" size={16} color={t.primary} />
            <Text style={[typography.caption, styles.switchText, { color: t.primary }]}>
              Choose from lists
            </Text>
          </Pressable>
        ) : valid ? (
          <Text style={[typography.caption, { color: t.muted }]}>
            The lists can’t show verses running across chapters, so this reference stays typed.
          </Text>
        ) : null}
      </View>
    );
  }

  const rows: (PassagePick | null)[] = picks.length > 0 ? picks : [null];
  const row = open?.row ?? 0;
  const step = open?.step ?? null;
  const current = picks[row] ?? null;
  const oneChapter = current?.book.chapters.length === 1;
  const verses = current ? versesInChapter(current) : 0;
  const wholeLabel = oneChapter ? "Whole book" : "Whole chapter";
  const canAdd = editable && picks.length > 0 && parseBibleReference(passage).ok && canAddPassage(passage);

  const title =
    step === "book" || !current
      ? "Book"
      : step === "chapter"
        ? `${current.book.name}: chapter`
        : step === "from"
          ? `${chapterLabel(current)}: first verse`
          : step === "toChapter"
            ? `${chapterLabel(current)}: last chapter`
            : `${chapterLabel(current)}: last verse`;

  return (
    <View style={styles.wrap}>
      {rows.map((pick, index) => (
        <PickRow
          // eslint-disable-next-line react/no-array-index-key -- a row is its place in the passage; rows have no other identity
          key={index}
          pick={pick}
          row={index}
          rows={rows.length}
          editable={editable}
          onOpen={(next) => setOpen({ row: index, step: next })}
          onRemove={() => write(index, null)}
        />
      ))}
      {tooLong ? (
        <Text style={[typography.caption, { color: t.danger }]} testID="devotional-passage-too-long">
          {PASSAGE_TOO_LONG_TEXT}
        </Text>
      ) : null}
      {canAdd ? (
        <Pressable
          onPress={() => setOpen({ row: picks.length, step: "book" })}
          accessibilityRole="button"
          testID="devotional-passage-add"
          hitSlop={8}
          style={({ pressed }) => [styles.switch, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="add-circle-outline" size={16} color={t.primary} />
          <Text style={[typography.caption, styles.switchText, { color: t.primary }]}>
            Add another passage
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => setTypingChosen(true)}
        disabled={!editable}
        accessibilityRole="button"
        testID="devotional-passage-type"
        hitSlop={8}
        style={({ pressed }) => [styles.switch, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="create-outline" size={16} color={t.primary} />
        <Text style={[typography.caption, styles.switchText, { color: t.primary }]}>
          Type a reference instead
        </Text>
      </Pressable>

      <OptionSheet visible={step !== null} title={title} onClose={close}>
        {step === "book" || !current ? (
          <>
            <SearchField value={query} onChangeText={setQuery} placeholder="Search books" />
            {current && !query.trim() ? (
              <OptionRow
                label={picks.length > 1 ? "Remove this passage" : "No passage"}
                selected={false}
                onPress={() => { write(row, null); close(); }}
              />
            ) : null}
            <BookList
              query={query}
              selected={current?.book ?? null}
              onPick={(book) => {
                if (!write(row, chooseBook(book))) return;
                setQuery("");
                setOpen(book.chapters.length === 1 ? null : { row, step: "chapter" });
              }}
            />
          </>
        ) : step === "chapter" ? (
          <NumberGrid
            from={1}
            to={current.book.chapters.length}
            selected={current.chapter}
            noun="Chapter"
            onPick={(chapter) => {
              write(row, chooseChapter(current, chapter));
              close();
            }}
          />
        ) : step === "from" ? (
          <>
            <OptionRow
              label={wholeLabel}
              selected={current.fromVerse === null}
              onPress={() => {
                write(row, chooseFromVerse(current, null));
                close();
              }}
            />
            <NumberGrid
              from={1}
              to={verses}
              selected={current.fromVerse}
              noun="Verse"
              onPick={(verse) => {
                if (!write(row, chooseFromVerse(current, verse))) return;
                setOpen(verse < verses ? { row, step: "to" } : null);
              }}
            />
          </>
        ) : step === "toChapter" && current.chapter !== null ? (
          <>
            <OptionRow
              label={`Just chapter ${current.chapter}`}
              selected={current.toChapter === null}
              onPress={() => {
                write(row, chooseToChapter(current, null));
                close();
              }}
            />
            <NumberGrid
              from={current.chapter + 1}
              to={current.book.chapters.length}
              selected={current.toChapter}
              noun="Chapter"
              onPick={(chapter) => {
                write(row, chooseToChapter(current, chapter));
                close();
              }}
            />
          </>
        ) : step === "to" && current.fromVerse !== null ? (
          <>
            <OptionRow
              label={`Just verse ${current.fromVerse}`}
              selected={current.toVerse === null}
              onPress={() => {
                write(row, chooseToVerse(current, null));
                close();
              }}
            />
            <NumberGrid
              from={current.fromVerse + 1}
              to={verses}
              selected={current.toVerse}
              noun="Verse"
              onPick={(verse) => {
                write(row, chooseToVerse(current, verse));
                close();
              }}
            />
          </>
        ) : null}
      </OptionSheet>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  face: { gap: 6 },
  faceInRow: { flex: 1, minWidth: 0 },
  arrow: { alignSelf: "center" },
  faceButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  typed: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  laterRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.xs },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, minWidth: 0 },
  rowTitleText: { flexShrink: 1, fontSize: 15 },
  badge: { width: 24, height: 24, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  rowSize: { flexShrink: 0 },
  removeButton: { minHeight: 44, minWidth: 44, justifyContent: "flex-end" },
  switch: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start" },
  switchText: { fontWeight: "700" },
  groupHeader: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs + 2, paddingTop: spacing.xs },
  cell: {
    width: 48,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontWeight: "600" },
});
