import { hapticSelect } from "@/components/ui";
import { chooseCharacter, useCharacterChoice } from "@/lib/games/gameStorage";
import { fixedColours, radius, spacing, typography } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { characterLook, CHARACTERS, type Character, type CharacterGame } from "@shared/gameCharacters";
import { NPC, type Look } from "@shared/world";
import { useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../../convex/_generated/api";

const g = fixedColours.games;

const useMyLook = (): Look | null | undefined => useQuery(api.gameCharacters.myLook);

type AvatarModule = typeof import("@/world/GameAvatars");
export type AvatarArt = Pick<AvatarModule, "RunnerCharacter" | "CharacterHead">;

let artLoad: Promise<AvatarArt> | null = null;
let loadedArt: AvatarArt | null = null;

const loadArt = () =>
  (artLoad ??= import("@/world/GameAvatars").then(
    ({ RunnerCharacter, CharacterHead }) => (loadedArt = { RunnerCharacter, CharacterHead }),
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

export const useGameLook = (game: CharacterGame): Look | null => {
  const choice = useCharacterChoice(game);
  const mine = useMyLook();
  return characterLook(choice, mine);
};

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
  return (
    <View style={styles.picker} role="radiogroup" testID={`character-picker-${game}`}>
      {CHARACTERS.map((character) => {
        const look = looks[character];
        const selected = choice === character;
        return (
          <Pressable
            key={character}
            onPress={() => {
              hapticSelect();
              void chooseCharacter(game, character);
            }}
            role="radio"
            aria-checked={selected}
            accessibilityLabel={A11Y[character]}
            testID={`character-${character}`}
            style={({ pressed }) => [styles.option, selected && styles.selected, pressed && styles.pressed]}
          >
            <View style={styles.picture}>
              {look && art ? picture(look, art) : look || character === "mine" ? <Ionicons name="person-outline" size={28} color={g.text} /> : original}
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
  picker: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  option: {
    width: 72,
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
