import { hapticSelect } from "@/components/ui";
import { chooseCharacter, useCharacterChoice } from "@/lib/games/gameStorage";
import { fixedColours, radius, spacing, typography } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { characterLook, CHARACTERS, type Character, type CharacterGame } from "@shared/gameCharacters";
import { NPC, type Look } from "@shared/world";
import { useQuery } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type ViewInstance } from "react-native";
import { api } from "../../../convex/_generated/api";

const g = fixedColours.games;

const useMyLook = (): Look | null | undefined => useQuery(api.gameCharacters.myLook);

type AvatarModule = typeof import("@/world/GameAvatars");
export type AvatarArt = Pick<AvatarModule, "RunnerCharacter" | "CharacterHead" | "CheeringCharacter">;

let artLoad: Promise<AvatarArt> | null = null;
let loadedArt: AvatarArt | null = null;

const loadArt = () =>
  (artLoad ??= import("@/world/GameAvatars").then(
    ({ RunnerCharacter, CharacterHead, CheeringCharacter }) => (loadedArt = { RunnerCharacter, CharacterHead, CheeringCharacter }),
    (error: unknown) => {
      artLoad = null;
      throw error;
    }
  ));

export const useAvatarArt = (wanted: boolean): AvatarArt | null => {
  const [art, setArt] = useState(loadedArt);
  useEffect(() => {
    if (!wanted || art) return;
    let live = true;
    loadArt().then(
      (loaded) => live && setArt(loaded),
      () => undefined
    );
    return () => {
      live = false;
    };
  }, [wanted, art]);
  return art;
};

/**
 * Starts loading the avatar art without waiting for it, so a start card
 * opened from here has the faces ready. The art stays out of the app's own
 * startup either way.
 */
export const usePreloadAvatarArt = () => {
  useEffect(() => {
    loadArt().catch(() => undefined);
  }, []);
};

export const useGameLook = (game: CharacterGame): Look | null => {
  const choice = useCharacterChoice(game);
  const mine = useMyLook();
  return characterLook(choice, mine);
};

const STEP_KEYS: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const PICK_KEYS = new Set([" ", "Enter"]);

type KeyEvent = { key: string; target: unknown; preventDefault: () => void; stopPropagation: () => void };

const OPTION_WIDTH = 72;
const OPTION_GAP = spacing.sm;
export const PICKER_WIDTH = CHARACTERS.length * OPTION_WIDTH + (CHARACTERS.length - 1) * OPTION_GAP;

const LABELS: Record<Character, string> = { mine: "You", sij: "Sij", original: "Original" };
const A11Y: Record<Character, string> = {
  mine: "Your World character",
  sij: "Sij from the Cafe",
  original: "The original",
};

export const CharacterPicker = ({
  game,
  picture,
  original,
}: {
  game: CharacterGame;
  picture: (look: Look, art: AvatarArt) => ReactNode;
  original: ReactNode;
}) => {
  const choice = useCharacterChoice(game);
  const mine = useMyLook();
  const art = useAvatarArt(true);
  const looks: Record<Character, Look | null> = { mine: characterLook("mine", mine), sij: NPC.look, original: null };
  const options = useRef<(ViewInstance | null)[]>([]);
  const pick = (character: Character) => {
    hapticSelect();
    void chooseCharacter(game, character);
  };
  const keys =
    Platform.OS === "web"
      ? ({
          onKeyDown: (event: KeyEvent) => {
            const step = STEP_KEYS[event.key];
            if (step === undefined && !PICK_KEYS.has(event.key)) return;
            event.preventDefault();
            event.stopPropagation();
            if (step === undefined) {
              const focused = options.current.findIndex((option) => option === event.target);
              if (focused >= 0) pick(CHARACTERS[focused]);
              return;
            }
            const next = (CHARACTERS.indexOf(choice) + step + CHARACTERS.length) % CHARACTERS.length;
            pick(CHARACTERS[next]);
            options.current[next]?.focus();
          },
          onKeyUp: (event: KeyEvent) => {
            if (STEP_KEYS[event.key] !== undefined || PICK_KEYS.has(event.key)) event.stopPropagation();
          },
        } as object)
      : {};
  return (
    <View style={styles.picker} role="radiogroup" testID={`character-picker-${game}`} {...keys}>
      {CHARACTERS.map((character, index) => {
        const look = looks[character];
        const selected = choice === character;
        return (
          <Pressable
            key={character}
            ref={(option) => {
              options.current[index] = option;
            }}
            focusable={selected}
            onPress={() => pick(character)}
            role="radio"
            aria-checked={selected}
            accessibilityLabel={A11Y[character]}
            testID={`character-${character}`}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
          >
            <View style={styles.picture}>
              {look && art ? (
                picture(look, art)
              ) : look || (character === "mine" && mine === undefined) ? (
                // A face still loading: a blank one, not the icon that means "no World character".
                <View style={styles.loadingFace} testID={`character-${character}-loading`} />
              ) : character === "mine" ? (
                <Ionicons name="person-outline" size={28} color={g.text} />
              ) : (
                original
              )}
            </View>
            <Text style={[styles.label, selected && styles.selectedLabel]}>{LABELS[character]}</Text>
            {selected ? (
              <View style={styles.tick}>
                <Ionicons name="checkmark" size={12} color={g.button.text} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  picker: { flexDirection: "row", gap: OPTION_GAP, marginTop: spacing.sm },
  option: {
    width: OPTION_WIDTH,
    alignItems: "center",
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: g.cardEdge,
    backgroundColor: g.buttonGhost.bg,
  },
  selected: { borderColor: g.button.bg },
  pressed: { opacity: 0.7 },
  picture: { width: 48, height: 48, alignItems: "center", justifyContent: "flex-end" },
  loadingFace: { width: 34, height: 34, marginBottom: 3, borderRadius: 17, backgroundColor: g.loadingFace },
  label: { ...typography.caption, color: g.text, opacity: 0.8 },
  selectedLabel: { opacity: 1, fontWeight: "700" },
  tick: {
    position: "absolute",
    top: -7,
    right: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: g.button.bg,
  },
});
