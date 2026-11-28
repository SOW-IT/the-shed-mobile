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

const CELL_MIN = 48;
const GRID_GAP = spacing.xs + 2;
/** Grids longer than this get a box to type the number into. */
const JUMP_AFTER = 30;

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
  range,
}: {
  from: number;
  to: number;
  selected: number | null;
  noun: string;
  onPick: (n: number) => void;
  /** Shade the numbers before the selected one too: the grid picks the end of a range that starts before `from`. */
  range?: boolean;
}) => {
  const t = useAppTheme();
  const [width, setWidth] = useState(0);
  const numbers = Array.from({ length: Math.max(to - from + 1, 0) }, (_, i) => from + i);
  // As many columns as fit, stretched to fill the row so the grid has no ragged right edge.
  const columns = Math.max(Math.floor((width + GRID_GAP) / (CELL_MIN + GRID_GAP)), 1);
  const cellWidth = width > 0 ? Math.floor((width - GRID_GAP * (columns - 1)) / columns) : CELL_MIN;
  return (
    <View>
      {numbers.length > JUMP_AFTER ? <NumberJump from={from} to={to} noun={noun} onPick={onPick} /> : null}
      <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {numbers.map((n) => {
          const on = n === selected;
          const within = range === true && selected !== null && n < selected;
          return (
            <Pressable
              key={n}
              onPress={() => onPick(n)}
              accessibilityRole="button"
              accessibilityLabel={on ? `${noun} ${n}, selected` : `${noun} ${n}`}
              testID={`passage-${noun.toLowerCase()}-${n}`}
              style={({ pressed }) => [
                styles.cell,
                { width: cellWidth },
                { backgroundColor: on ? t.primary : within ? t.primarySoft : t.inputBackground },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[typography.body, styles.cellText, { color: on ? t.onPrimary : t.text }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

/**
 * A box to type a chapter or verse number into, above a long grid (Psalms
 * has 150 chapters, Psalm 119 has 176 verses), so the far end is one entry
 * away instead of a long scroll.
 */
const NumberJump = ({
  from,
  to,
  noun,
  onPick,
}: {
  from: number;
  to: number;
  noun: string;
  onPick: (n: number) => void;
}) => {
  const t = useAppTheme();
  const [text, setText] = useState("");
  const n = Number(text);
  const valid = text !== "" && Number.isInteger(n) && n >= from && n <= to;
  const go = () => {
    if (valid) onPick(n);
  };
  return (
    <View style={styles.jump}>
      <TextInput
        value={text}
        onChangeText={(value) => setText(value.replace(/[^0-9]/g, ""))}
        onSubmitEditing={go}
        placeholder={`Type a ${noun.toLowerCase()}, ${from}–${to}`}
        placeholderTextColor={t.faint}
        keyboardType="number-pad"
        returnKeyType="go"
        maxLength={3}
        accessibilityLabel={`${noun} number, ${from} to ${to}`}
        testID={`passage-${noun.toLowerCase()}-jump`}
        style={[
          styles.jumpInput,
          typography.body,
          { color: t.text, backgroundColor: t.inputBackground, borderColor: text && !valid ? t.danger : t.border },
        ]}
      />
      <Pressable
        onPress={go}
        disabled={!valid}
        accessibilityRole="button"
        accessibilityLabel={valid ? `Choose ${noun.toLowerCase()} ${n}` : `Choose ${noun.toLowerCase()}`}
        accessibilityState={{ disabled: !valid }}
        testID={`passage-${noun.toLowerCase()}-jump-go`}
        style={({ pressed }) => [
          styles.jumpGo,
          { backgroundColor: valid ? t.primary : t.inputBackground },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Ionicons name="arrow-forward" size={20} color={valid ? t.onPrimary : t.faint} />
      </Pressable>
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

/** The book after this one, or null after Revelation. */
const nextBook = (book: BibleBook): BibleBook | null => BIBLE_BOOKS[BIBLE_BOOKS.indexOf(book) + 1] ?? null;

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
  canRunOn,
  onOpen,
  onRemove,
}: {
  pick: PassagePick | null;
  row: number;
  rows: number;
  editable: boolean;
  /** Whether another passage fits under the length limit, so a run can carry on into the next book. */
  canRunOn: boolean;
  onOpen: (step: Step) => void;
  onRemove: () => void;
}) => {
  const t = useAppTheme();
  const oneChapter = pick?.book.chapters.length === 1;
  const verses = pick ? versesInChapter(pick) : 0;
  const laterChapters =
    pick?.chapter != null &&
    (pick.chapter < pick.book.chapters.length || (canRunOn && nextBook(pick.book) !== null));
  const size = pick ? rangeSize(pick) : null;
  return (
    <View style={[styles.wrap, row > 0 && [styles.laterRow, { borderTopColor: t.border }]]}>
      {rows > 1 ? (
        <View style={styles.rowHeader}>
          <View
            style={styles.rowTitle}
            accessible
            accessibilityRole="header"
            accessibilityLabel={`Passage ${row + 1}${pick ? `, ${passageFromPick(pick)}` : ""}${size ? `, ${size}` : ""}`}
          >
            <View style={[styles.badge, { backgroundColor: t.primarySoft }]}>
              <Text style={[typography.label, { color: t.primary }]}>{row + 1}</Text>
            </View>
            <Text
              numberOfLines={1}
              style={[typography.label, styles.rowTitleText, { color: pick ? t.text : t.muted }]}
            >
              {pick ? passageFromPick(pick) : `Passage ${row + 1}`}
            </Text>
            {size ? (
              <Text numberOfLines={1} style={[typography.caption, styles.rowSize, { color: t.muted }]}>
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
  const [open, setOpen] = useState<{ row: number; step: Step; visit: number } | null>(null);
  const [visits, setVisits] = useState(0);
  const [query, setQuery] = useState("");
  const [tooLong, setTooLong] = useState(false);
  const picks = read === "custom" ? [] : (read ?? []);

  const close = () => {
    setOpen(null);
    setQuery("");
  };
  /**
   * Opens the sheet on a row's step, or closes it for `null`. Each opening is
   * a new visit, which keys the number grids, so a number typed into one list
   * (a first verse, or Genesis's last chapter) doesn't carry into the next.
   */
  const openAt = (row: number, step: Step | null) => {
    if (step === null) {
      close();
      return;
    }
    setVisits(visits + 1);
    setOpen({ row, step, visit: visits + 1 });
  };
  /**
   * Sets the row's pick, or removes the row for `null`. A row past the end is
   * a new one. A change that would take the passage over the length limit is
   * refused: the sheet closes and says why. Returns whether it was written.
   */
  const write = (row: number, next: PassagePick | null, after?: PassagePick): boolean => {
    const nextPicks = [...picks];
    if (next) nextPicks[row] = next;
    else nextPicks.splice(row, 1);
    if (next && after) nextPicks.splice(row + 1, 0, after);
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
        <View>
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
              editable && passage ? styles.typedClearable : null,
            ]}
          />
          {editable && passage ? (
            <Pressable
              onPress={() => {
                setTypingChosen(false);
                setTooLong(false);
                onChange("");
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear the passage"
              accessibilityHint="Goes back to choosing from lists"
              testID="devotional-passage-clear"
              style={({ pressed }) => [styles.clear, pressed && { opacity: 0.6 }]}
            >
              <Ionicons name="close-circle" size={20} color={t.faint} />
            </Pressable>
          ) : null}
        </View>
        {canUseLists ? (
          <Pressable
            onPress={() => {
              setTypingChosen(false);
              setTooLong(false);
            }}
            disabled={!editable}
            accessibilityRole="button"
            testID="devotional-passage-use-lists"
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
  const gridKey = `${row}-${step}-${open?.visit ?? 0}`;
  const current = picks[row] ?? null;
  const oneChapter = current?.book.chapters.length === 1;
  const verses = current ? versesInChapter(current) : 0;
  const wholeLabel = oneChapter ? "Whole book" : "Whole chapter";
  const following = current ? nextBook(current.book) : null;
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
          canRunOn={canAddPassage(passage)}
          onOpen={(next) => openAt(index, next)}
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
          onPress={() => openAt(picks.length, "book")}
          accessibilityRole="button"
          testID="devotional-passage-add"
          style={({ pressed }) => [styles.addButton, { borderColor: t.border }, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="add" size={20} color={t.primary} />
          <Text style={[typography.body, styles.switchText, { color: t.primary }]}>Add another passage</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          setTypingChosen(true);
          setTooLong(false);
        }}
        disabled={!editable}
        accessibilityRole="button"
        testID="devotional-passage-type"
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
                openAt(row, book.chapters.length === 1 ? null : "chapter");
              }}
            />
          </>
        ) : step === "chapter" ? (
          <NumberGrid
            key={gridKey}
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
              key={gridKey}
              from={1}
              to={verses}
              selected={current.fromVerse}
              noun="Verse"
              onPick={(verse) => {
                if (!write(row, chooseFromVerse(current, verse))) return;
                openAt(row, verse < verses ? "to" : null);
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
              key={gridKey}
              from={current.chapter + 1}
              to={current.book.chapters.length}
              selected={current.toChapter}
              noun="Chapter"
              range
              onPick={(chapter) => {
                write(row, chooseToChapter(current, chapter));
                close();
              }}
            />
            {following && canAddPassage(passage) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Run on into ${following.name}`}
                accessibilityHint={`Ends this passage at ${current.book.name} ${current.book.chapters.length} and adds ${following.name}`}
                testID="passage-run-on"
                style={({ pressed }) => [styles.runOn, { borderColor: t.border }, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  const end = chooseToChapter(current, current.book.chapters.length);
                  if (!write(row, end, chooseChapter(chooseBook(following), 1))) return;
                  openAt(row + 1, following.chapters.length === 1 ? null : "toChapter");
                }}
              >
                <View style={styles.runOnText}>
                  <Text style={[typography.body, styles.cellText, { color: t.primary }]}>Run on into {following.name}</Text>
                  <Text style={[typography.caption, { color: t.muted }]}>
                    Ends at {current.book.name} {current.book.chapters.length} and adds {following.name}
                  </Text>
                </View>
                <Ionicons name="arrow-forward" size={18} color={t.primary} />
              </Pressable>
            ) : null}
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
              key={gridKey}
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
  typedClearable: { paddingRight: 44 },
  clear: { position: "absolute", right: 0, top: 0, bottom: 0, width: 44, alignItems: "center", justifyContent: "center" },
  laterRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.md, marginTop: spacing.xs },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flex: 1, minWidth: 0 },
  rowTitleText: { flexShrink: 1, fontSize: 15 },
  badge: { width: 24, height: 24, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  rowSize: { flexShrink: 0 },
  removeButton: { minHeight: 44, minWidth: 44, justifyContent: "flex-end" },
  switch: { flexDirection: "row", alignItems: "center", gap: spacing.xs, alignSelf: "flex-start", minHeight: 44 },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    minHeight: 48,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  switchText: { fontWeight: "700" },
  groupHeader: { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP, paddingTop: spacing.xs },
  cell: {
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontWeight: "600" },
  jump: { flexDirection: "row", gap: spacing.sm, paddingBottom: spacing.sm },
  jumpInput: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 44 },
  jumpGo: { width: 48, minHeight: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  runOn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 56,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  runOnText: { flex: 1, gap: 2 },
});
