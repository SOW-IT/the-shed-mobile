import { hapticSelect, Muted, OptionRow, OptionSheet, SearchField } from "@/components/ui";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BIBLE_BOOKS,
  type BibleBook,
  chooseBook,
  chooseChapter,
  chooseFromVerse,
  chooseToVerse,
  OLD_TESTAMENT_BOOKS,
  type PassagePick,
  parseBibleReference,
  passageFromPick,
  pickFromPassage,
  searchBibleBooks,
  versesInChapter,
} from "@shared/bible";
import { MAX_PASSAGE_LENGTH } from "@shared/devotionals";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

type Step = "book" | "chapter" | "from" | "to";

const NEW_TESTAMENT_START = BIBLE_BOOKS[OLD_TESTAMENT_BOOKS];

const PickerFace = ({
  label,
  value,
  placeholder,
  onPress,
  disabled,
  testID,
  inRow,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  disabled: boolean;
  testID: string;
  inRow?: boolean;
}) => {
  const t = useAppTheme();
  return (
    <View style={[styles.face, inRow && styles.faceInRow]}>
      <Text style={[typography.label, { color: t.muted }]}>{label}</Text>
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

/**
 * The devotional's passage as a book, chapter and verse range picked from
 * lists. The stored text is unchanged: a pick is written the way a typed
 * reference is saved, and a saved reference the lists can't show (several
 * passages, or a range across chapters) stays in the typed box.
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
  const pick = pickFromPassage(passage);
  const [typingChosen, setTypingChosen] = useState(false);
  const typing = typingChosen || pick === "custom";
  const [step, setStep] = useState<Step | null>(null);
  const [query, setQuery] = useState("");
  const current = pick === "custom" ? null : pick;

  const write = (next: PassagePick | null) => {
    hapticSelect();
    onChange(next ? passageFromPick(next) : "");
  };
  const close = () => {
    setStep(null);
    setQuery("");
  };

  if (typing) {
    const canUseLists = pick !== "custom";
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
            The lists show one chapter at a time, so this reference stays typed.
          </Text>
        ) : null}
      </View>
    );
  }

  const oneChapter = current?.book.chapters.length === 1;
  const verses = current ? versesInChapter(current) : 0;
  const wholeLabel = oneChapter ? "Whole book" : "Whole chapter";

  const title =
    step === "book" || !current
      ? "Book"
      : step === "chapter"
        ? `${current.book.name}: chapter`
        : step === "from"
          ? `${chapterLabel(current)}: first verse`
          : `${chapterLabel(current)}: last verse`;

  return (
    <View style={styles.wrap}>
      <PickerFace
        label="Book"
        value={current?.book.name ?? null}
        placeholder="Choose a book"
        onPress={() => setStep("book")}
        disabled={!editable}
        testID="devotional-passage-book"
      />
      <View style={styles.row}>
        {oneChapter ? null : (
          <PickerFace
            label="Chapter"
            value={current?.chapter == null ? null : String(current.chapter)}
            placeholder="–"
            onPress={() => setStep("chapter")}
            disabled={!editable || !current}
            testID="devotional-passage-chapter"
            inRow
          />
        )}
        <PickerFace
          label="Verse"
          value={current?.fromVerse == null ? null : String(current.fromVerse)}
          placeholder={verses ? "All" : "–"}
          onPress={() => setStep("from")}
          disabled={!editable || !verses}
          testID="devotional-passage-from"
          inRow
        />
        <PickerFace
          label="To"
          value={current?.toVerse == null ? null : String(current.toVerse)}
          placeholder="–"
          onPress={() => setStep("to")}
          disabled={!editable || current?.fromVerse == null}
          testID="devotional-passage-to"
          inRow
        />
      </View>
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
              <OptionRow label="No passage" selected={false} onPress={() => { write(null); close(); }} />
            ) : null}
            <BookList
              query={query}
              selected={current?.book ?? null}
              onPick={(book) => {
                write(chooseBook(book));
                setQuery("");
                setStep(book.chapters.length === 1 ? null : "chapter");
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
              write(chooseChapter(current, chapter));
              close();
            }}
          />
        ) : step === "from" ? (
          <>
            <OptionRow
              label={wholeLabel}
              selected={current.fromVerse === null}
              onPress={() => {
                write(chooseFromVerse(current, null));
                close();
              }}
            />
            <NumberGrid
              from={1}
              to={verses}
              selected={current.fromVerse}
              noun="Verse"
              onPick={(verse) => {
                write(chooseFromVerse(current, verse));
                setStep(verse < verses ? "to" : null);
              }}
            />
          </>
        ) : current.fromVerse !== null ? (
          <>
            <OptionRow
              label={`Just verse ${current.fromVerse}`}
              selected={current.toVerse === null}
              onPress={() => {
                write(chooseToVerse(current, null));
                close();
              }}
            />
            <NumberGrid
              from={current.fromVerse + 1}
              to={verses}
              selected={current.toVerse}
              noun="Verse"
              onPick={(verse) => {
                write(chooseToVerse(current, verse));
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
