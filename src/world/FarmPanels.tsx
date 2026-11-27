import { fonts } from "@/theme";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SharpScrollView } from "@/components/ui/SharpScrollView";
import { bagStacks, CROPS, seedList, stackLabel, type BuildingId, type CropId } from "@shared/farm";
import { FARM_OFFERS_FROM as FARMER } from "./shopTabs";
import { ANIMALS, BUILDINGS, cleanName, FEEDS, feedList, GOODS, goodsList, NAME_MAX, type AnimalId, type Mood } from "@shared/animals";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { AnimalThumb, FeedThumb, GoodThumb, TagThumb } from "./Animals";
import { GoldCoin } from "@/components/games/GoldCoin";
import { CropThumb, SeedCluster } from "./Farm";
import { blurBehind, Bust, itemStyle, NameAnimalDialog, popStyle, scrimStyle, useOverlayClock } from "./Overlays";
import { glass, gold, hud } from "./palette";

type Bag = { seeds: Record<string, number>; crops: Record<string, number>; feed?: Record<string, number>; goods?: Record<string, number>; nameTags?: number };

const Panel = ({
  open,
  top,
  testID,
  closeLabel,
  onClose,
  head,
  children,
  items = 6,
}: {
  open: boolean;
  top: number;
  testID: string;
  closeLabel: string;
  onClose: () => void;
  head: (style: object | null) => ReactNode;
  children: (overlay: ReturnType<typeof useOverlayClock>) => ReactNode;
  items?: number;
}) => {
  const overlay = useOverlayClock(open, items);
  const { width, height } = useWindowDimensions();
  if (!overlay.mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "box-none" : "none"}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} testID={`${testID}-close`}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle(overlay)]} />
      </Pressable>
      <Animated.View style={[styles.panel, blurBehind, { top, width: Math.min(420, width - 28), maxHeight: Math.max(300, height - top - 24) }, popStyle(overlay)]} testID={testID}>
        {head(itemStyle(overlay, 0))}
        {children(overlay)}
      </Animated.View>
    </View>
  );
};

const Close = ({ onPress }: { onPress: () => void }) => (
  <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close" style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
    <Ionicons name="close" size={18} color={glass.text} />
  </Pressable>
);

const Count = ({ n }: { n: number }) => (
  <View style={styles.count}>
    <Text style={styles.countText}>×{n}</Text>
  </View>
);

export const BagPanel = ({ open, top, bag, onClose }: { open: boolean; top: number; bag: Bag | null | undefined; onClose: () => void }) => {
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(420, width - 28) - 24 - 16 - 6) / 3);
  const seeds = seedList(bag?.seeds ?? {});
  const crops = bagStacks(bag?.crops ?? {});
  const goods = goodsList(bag?.goods ?? {});
  const feed = feedList(bag?.feed ?? {});
  const tags = bag?.nameTags ?? 0;
  return (
    <Panel
      open={open}
      top={top}
      testID="world-bag"
      closeLabel="Close the bag"
      onClose={onClose}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <View style={styles.icon}>
            <Ionicons name="bag-handle" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Bag
          </Text>
          <View style={styles.grow} />
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {(overlay) => (
        <SharpScrollView style={styles.scroll} contentContainerStyle={styles.body}>
          <Animated.View style={itemStyle(overlay, 1)}>
            <Text style={styles.section} accessibilityRole="header">
              Seeds
            </Text>
          </Animated.View>
          <View style={styles.grid}>
            {seeds.length === 0 ? <Text style={styles.muted}>None</Text> : null}
            {seeds.map(({ crop, count }) => (
              <View key={crop} style={[styles.card, { width: tile }]} accessible accessibilityLabel={`${CROPS[crop].label} seeds, ${count}`} testID={`world-bag-seed-${crop}`}>
                <SeedCluster crop={crop} size={tile - 30} dish />
                <Text style={styles.name} numberOfLines={1}>
                  {CROPS[crop].label}
                </Text>
                <Count n={count} />
              </View>
            ))}
          </View>
          <Animated.View style={itemStyle(overlay, 2)}>
            <Text style={styles.section} accessibilityRole="header">
              Crops
            </Text>
          </Animated.View>
          <View style={styles.grid}>
            {crops.length === 0 ? <Text style={styles.muted}>None</Text> : null}
            {crops.map((stack) => (
              <View key={stack.key} style={[styles.card, { width: tile }]} accessible accessibilityLabel={`${stackLabel(stack.crop, stack.wilts)}, ${stack.count}`} testID={`world-bag-crop-${stack.key}`}>
                <View style={stack.wilts > 0 && styles.wilted}>
                  <CropThumb crop={stack.crop} size={tile - 24} />
                </View>
                <Text style={styles.name} numberOfLines={1}>
                  {CROPS[stack.crop].label}
                </Text>
                {stack.wilts > 0 ? <Wilts n={stack.wilts} /> : null}
                <Count n={stack.count} />
              </View>
            ))}
          </View>
          <Animated.View style={itemStyle(overlay, 3)}>
            <Text style={styles.section} accessibilityRole="header">
              Eggs and milk
            </Text>
          </Animated.View>
          <View style={styles.grid}>
            {goods.length === 0 ? <Text style={styles.muted}>None</Text> : null}
            {goods.map((good) => (
              <View key={good.id} style={[styles.card, { width: tile }]} accessible accessibilityLabel={`${GOODS[good.id].label}, ${good.count}`} testID={`world-bag-good-${good.id}`}>
                <GoodThumb good={good.id} size={tile - 30} />
                <Text style={styles.name} numberOfLines={1}>
                  {GOODS[good.id].label}
                </Text>
                <Count n={good.count} />
              </View>
            ))}
          </View>
          <Animated.View style={itemStyle(overlay, 4)}>
            <Text style={styles.section} accessibilityRole="header">
              Feed and tags
            </Text>
          </Animated.View>
          <View style={styles.grid}>
            {feed.length === 0 && tags === 0 ? <Text style={styles.muted}>None</Text> : null}
            {feed.map((item) => (
              <View key={item.id} style={[styles.card, { width: tile }]} accessible accessibilityLabel={`${FEEDS[item.id].label}, ${item.count}`} testID={`world-bag-feed-${item.id}`}>
                <FeedThumb feed={item.id} size={tile - 30} />
                <Text style={styles.name} numberOfLines={1}>
                  {FEEDS[item.id].label}
                </Text>
                <Count n={item.count} />
              </View>
            ))}
            {tags > 0 ? (
              <View style={[styles.card, { width: tile }]} accessible accessibilityLabel={`Name tags, ${tags}`} testID="world-bag-nametags">
                <TagThumb size={tile - 30} />
                <Text style={styles.name} numberOfLines={1}>
                  Name tag
                </Text>
                <Count n={tags} />
              </View>
            ) : null}
          </View>
        </SharpScrollView>
      )}
    </Panel>
  );
};

const Wilts = ({ n }: { n: number }) => (
  <View style={styles.wiltChip}>
    <Text style={styles.wiltText}>{n === 1 ? "wilted once" : "wilted twice"}</Text>
  </View>
);

export const PlantPicker = ({
  plot,
  top,
  bag,
  onPick,
  onClose,
}: {
  plot: number | null;
  top: number;
  bag: Bag | null | undefined;
  onPick: (plot: number, crop: CropId) => void;
  onClose: () => void;
}) => {
  const [shown, setShown] = useState(plot);
  if (plot !== null && plot !== shown) setShown(plot);
  const { width } = useWindowDimensions();
  const tile = Math.floor((Math.min(420, width - 28) - 24 - 16 - 6) / 3);
  const seeds = seedList(bag?.seeds ?? {});
  return (
    <Panel
      open={plot !== null}
      top={top}
      testID="world-plant-picker"
      closeLabel="Close"
      onClose={onClose}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <View style={styles.icon}>
            <Ionicons name="leaf" size={18} color={hud.onAccent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            Plant
          </Text>
          <View style={styles.grow} />
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {() => (
        <View style={styles.body}>
          {seeds.length === 0 ? (
            <View style={styles.empty} testID="world-plant-no-seeds">
              <Bust look={FARMER.look} size={44} />
              <Text style={styles.emptyText}>Get seeds from {FARMER.name.split(" ")[0]}</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {seeds.map(({ crop, count }) => (
                <Pressable
                  key={crop}
                  onPress={() => shown !== null && onPick(shown, crop)}
                  accessibilityRole="button"
                  accessibilityLabel={`Plant ${CROPS[crop].label}, ${CROPS[crop].days} days, ${count} left`}
                  testID={`world-plant-${crop}`}
                  style={({ pressed }) => [styles.card, { width: tile }, pressed && styles.pressed]}
                >
                  <SeedCluster crop={crop} size={tile - 30} dish />
                  <Text style={styles.name} numberOfLines={1}>
                    {CROPS[crop].label}
                  </Text>
                  <Days n={CROPS[crop].days} />
                  <Count n={count} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </Panel>
  );
};

export const Days = ({ n }: { n: number }) => (
  <View style={styles.days}>
    <Ionicons name="time-outline" size={11} color={glass.text} />
    <Text style={styles.daysText}>{n}d</Text>
  </View>
);

export const PlotOffer = ({
  open,
  top,
  plot,
  price,
  balance,
  onBuy,
  onClose,
}: {
  open: boolean;
  top: number;
  plot: number;
  price: number | null;
  balance: number;
  onBuy: () => Promise<string | null>;
  onClose: () => void;
}) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setError(null);
  }
  const short = price !== null && balance < price;
  const buy = async () => {
    setBusy(true);
    setError(null);
    const problem = await onBuy();
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Panel
      open={open}
      top={top}
      testID="world-plot-offer"
      closeLabel="Close the offer"
      onClose={onClose}
      items={3}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <Bust look={FARMER.look} size={40} />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {FARMER.name}
          </Text>
          <View style={styles.grow} />
          <View style={styles.balance} accessibilityLabel={`${balance} coins`}>
            <GoldCoin size={18} />
            <Text style={styles.balanceText}>{balance}</Text>
          </View>
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {(overlay) => (
        <Animated.View style={[styles.offer, itemStyle(overlay, 1)]}>
          {price === null ? (
            <Text style={styles.offerTitle}>Every plot is yours</Text>
          ) : (
            <>
              <View style={styles.plotPicture}>
                <View style={styles.plotSoil} />
                <Text style={styles.plotNumber}>{plot + 1}</Text>
              </View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable
                onPress={() => void buy()}
                disabled={busy || short}
                accessibilityRole="button"
                accessibilityLabel={`Buy plot ${plot + 1} for ${price} coins`}
                testID="world-plot-buy"
                style={({ pressed }) => [styles.buy, (busy || short) && styles.buyOff, pressed && styles.pressed]}
              >
                <GoldCoin size={18} />
                <Text style={styles.buyText}>{short ? `${price}` : `Buy · ${price}`}</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      )}
    </Panel>
  );
};

export const BuildingOffer = ({
  kind,
  top,
  balance,
  onBuy,
  onClose,
}: {
  kind: BuildingId | null;
  top: number;
  balance: number;
  onBuy: (kind: BuildingId) => Promise<string | null>;
  onClose: () => void;
}) => {
  const [shown, setShown] = useState<BuildingId>(kind ?? "coop");
  if (kind !== null && kind !== shown) setShown(kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(kind !== null);
  if ((kind !== null) !== wasOpen) {
    setWasOpen(kind !== null);
    if (kind !== null) setError(null);
  }
  const building = BUILDINGS[shown];
  const animal = ANIMALS[building.animal];
  const short = balance < building.price;
  const buy = async () => {
    setBusy(true);
    setError(null);
    const problem = await onBuy(shown);
    setBusy(false);
    if (problem) setError(problem);
  };
  return (
    <Panel
      open={kind !== null}
      top={top}
      testID="world-building-offer"
      closeLabel="Close the offer"
      onClose={onClose}
      items={3}
      head={(style) => (
        <Animated.View style={[styles.header, style]}>
          <Bust look={FARMER.look} size={40} />
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {FARMER.name}
          </Text>
          <View style={styles.grow} />
          <View style={styles.balance} accessibilityLabel={`${balance} coins`}>
            <GoldCoin size={18} />
            <Text style={styles.balanceText}>{balance}</Text>
          </View>
          <Close onPress={onClose} />
        </Animated.View>
      )}
    >
      {(overlay) => (
        <Animated.View style={[styles.offer, itemStyle(overlay, 1)]}>
          <Text style={styles.offerTitle}>{building.label}</Text>
          <View style={styles.herd} accessibilityLabel={`Holds ${building.capacity} ${animal.label.toLowerCase()}s`}>
            {Array.from({ length: building.capacity }, (_, i) => (
              <AnimalThumb key={i} kind={building.animal} stage={2} size={building.animal === "cow" ? 64 : 44} />
            ))}
          </View>
          <View style={styles.facts}>
            <Fact icon="add-circle-outline" text={`${animal.stages[0]} · ${animal.price}`} />
            <Fact icon="time-outline" text={`${animal.growDays}d`} />
            <Fact icon="cash-outline" text={`${GOODS[animal.product].label} · ${animal.sells}`} />
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            onPress={() => void buy()}
            disabled={busy || short}
            accessibilityRole="button"
            accessibilityLabel={`Buy the ${building.short.toLowerCase()} for ${building.price} coins`}
            testID="world-building-buy"
            style={({ pressed }) => [styles.buy, (busy || short) && styles.buyOff, pressed && styles.pressed]}
          >
            <GoldCoin size={18} />
            <Text style={styles.buyText}>{short ? `${building.price}` : `Buy · ${building.price}`}</Text>
          </Pressable>
        </Animated.View>
      )}
    </Panel>
  );
};

const Fact = ({ icon, text }: { icon: ComponentProps<typeof Ionicons>["name"]; text: string }) => (
  <View style={styles.fact}>
    <Ionicons name={icon} size={12} color={glass.text} />
    <Text style={styles.factText}>{text}</Text>
  </View>
);

const changed = (was: string, now: string) => {
  const name = cleanName(now);
  return name !== null && name !== was;
};

type SheetAnimal = { id: string; kind: string; name: string; status: string; stage: 0 | 1 | 2; mood: Mood };

export const PenSheet = ({
  kind,
  top,
  animals,
  balance,
  nameTags,
  suggest,
  onBuy,
  onRename,
  onClose,
}: {
  kind: BuildingId | null;
  top: number;
  animals: readonly SheetAnimal[];
  balance: number;
  nameTags: number;
  suggest: (kind: AnimalId) => string;
  onBuy: (kind: AnimalId, name: string) => Promise<string | null>;
  onRename: (id: string, name: string) => Promise<string | null>;
  onClose: () => void;
}) => {
  const [shown, setShown] = useState<BuildingId>(kind ?? "coop");
  const [wasOpen, setWasOpen] = useState(kind !== null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (kind !== null && kind !== shown) setShown(kind);
  if ((kind !== null) !== wasOpen) {
    setWasOpen(kind !== null);
    if (kind !== null) {
      setError(null);
      setRenaming(null);
      setNaming(false);
    }
  }
  const building = BUILDINGS[shown];
  const animalKind = building.animal;
  const animal = ANIMALS[animalKind];
  const here = animals.filter((a) => a.kind === animalKind);
  const space = here.length < building.capacity;
  const short = balance < animal.price;
  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const problem = await task();
    setBusy(false);
    if (problem) setError(problem);
    return problem;
  };
  const josh = FARMER.name.split(" ")[0];
  const young = animal.stages[0].toLowerCase();
  const canBuy = !busy && !short && cleanName(name) !== null;
  const buy = () =>
    void run(() => onBuy(animalKind, name)).then((problem) => {
      if (!problem) setNaming(false);
    });
  return (
    <>
      <Panel
        open={kind !== null}
        top={top}
        testID="world-pen-sheet"
        closeLabel="Close"
        onClose={onClose}
        items={2 + here.length}
        head={(style) => (
          <Animated.View style={[styles.header, style]}>
            <View style={styles.icon}>
              <Text style={styles.iconText}>{animalKind === "cow" ? "🐄" : "🐔"}</Text>
            </View>
            <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
              {building.short}
            </Text>
            <View style={styles.days}>
              <Text style={styles.daysText}>
                {here.length} / {building.capacity}
              </Text>
            </View>
            <View style={styles.grow} />
            <Close onPress={onClose} />
          </Animated.View>
        )}
      >
        {(overlay) => (
          <SharpScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {here.map((a, i) => (
              <Animated.View key={a.id} style={[styles.animalRow, itemStyle(overlay, 1 + i)]} testID={`world-pen-animal-${a.id}`}>
                <AnimalThumb kind={animalKind} stage={a.stage} mood={a.mood} size={44} />
                {renaming?.id === a.id ? (
                  <View style={styles.renameBox}>
                    <TextInput
                      value={renaming.name}
                      onChangeText={(text) => setRenaming({ id: a.id, name: text })}
                      maxLength={NAME_MAX}
                      autoFocus
                      accessibilityLabel={`New name for ${a.name}`}
                      style={styles.input}
                      testID="world-rename-input"
                    />
                    <Pressable
                      onPress={() =>
                        void run(() => onRename(a.id, renaming.name)).then((problem) => {
                          if (!problem) setRenaming((current) => (current?.id === a.id ? null : current));
                        })
                      }
                      disabled={busy || nameTags < 1 || !changed(a.name, renaming.name)}
                      accessibilityRole="button"
                      accessibilityLabel="Rename, uses one name tag"
                      testID="world-rename-save"
                      style={({ pressed }) => [styles.tagButton, (busy || nameTags < 1 || !changed(a.name, renaming.name)) && styles.buyOff, pressed && styles.pressed]}
                    >
                      <TagThumb size={22} />
                      <Text style={styles.tagButtonText}>{nameTags}</Text>
                    </Pressable>
                    <Close onPress={() => setRenaming(null)} />
                  </View>
                ) : (
                  <>
                    <View style={styles.animalText}>
                      <Text style={styles.name} numberOfLines={1}>
                        {a.name}
                      </Text>
                      <Text style={styles.muted} numberOfLines={1}>
                        {a.status}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        setError(null);
                        setRenaming({ id: a.id, name: a.name });
                      }}
                      disabled={nameTags < 1}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel={`Rename ${a.name}`}
                      accessibilityHint={nameTags < 1 ? `Needs a name tag from ${josh}` : undefined}
                      testID={`world-rename-${a.id}`}
                      style={({ pressed }) => [styles.renameButton, nameTags < 1 && styles.buyOff, pressed && styles.pressed]}
                    >
                      <Ionicons name="pricetag-outline" size={14} color={glass.text} />
                      <Text style={styles.renameText}>Rename</Text>
                    </Pressable>
                  </>
                )}
              </Animated.View>
            ))}
            {here.length > 0 && nameTags < 1 ? (
              <Text style={styles.muted} testID="world-rename-hint">
                Renaming uses a name tag. Get one from {josh}.
              </Text>
            ) : null}
            {space ? (
              <Animated.View style={[styles.newRow, itemStyle(overlay, 1 + here.length)]}>
                <AnimalThumb kind={animalKind} stage={0} size={44} />
                <View style={styles.animalText}>
                  <Text style={styles.name} numberOfLines={1}>
                    New {young}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    You name it next
                  </Text>
                </View>
                <Pressable
                  onPress={() => {
                    setError(null);
                    setName(suggest(animalKind));
                    setNaming(true);
                  }}
                  disabled={busy || short}
                  accessibilityRole="button"
                  accessibilityLabel={`Buy a ${young} for ${animal.price} coins`}
                  testID="world-buy-animal"
                  style={({ pressed }) => [styles.buySmall, (busy || short) && styles.buyOff, pressed && styles.pressed]}
                >
                  <GoldCoin size={16} />
                  <Text style={styles.buyText}>{animal.price}</Text>
                </Pressable>
              </Animated.View>
            ) : null}
            {error && !naming ? <Text style={styles.error}>{error}</Text> : null}
          </SharpScrollView>
        )}
      </Panel>
      <NameAnimalDialog
        open={kind !== null && naming}
        top={top}
        title={`Name your ${young}`}
        art={<AnimalThumb kind={animalKind} stage={0} size={64} />}
        name={name}
        maxLength={NAME_MAX}
        price={
          <>
            <GoldCoin size={16} />
            <Text style={styles.buyText}>Buy · {animal.price}</Text>
          </>
        }
        canBuy={canBuy}
        error={naming ? error : null}
        onName={setName}
        onCancel={() => {
          setError(null);
          setNaming(false);
        }}
        onBuy={buy}
      />
    </>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: glass.scrim },
  panel: { position: "absolute", alignSelf: "center", borderRadius: 24, backgroundColor: glass.panel, borderWidth: 1.5, borderColor: glass.edge, paddingTop: 12, overflow: "hidden", transformOrigin: "top" },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingBottom: 10 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: hud.accent },
  title: { fontFamily: fonts.display, fontSize: 19, color: glass.text, flexShrink: 1 },
  grow: { flex: 1 },
  close: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: glass.row },
  pressed: { opacity: 0.7 },
  scroll: { flexGrow: 0 },
  body: { paddingHorizontal: 12, paddingBottom: 14, gap: 8 },
  section: { color: glass.muted, fontWeight: "800", fontSize: 12, letterSpacing: 0.6, textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 16, backgroundColor: glass.row },
  name: { color: glass.text, fontWeight: "700", fontSize: 12.5 },
  muted: { color: glass.muted, fontSize: 13, fontWeight: "600" },
  count: { position: "absolute", top: 4, right: 4, minWidth: 24, height: 20, paddingHorizontal: 5, borderRadius: 10, backgroundColor: hud.accent, alignItems: "center", justifyContent: "center" },
  countText: { color: hud.onAccent, fontSize: 11, fontWeight: "800" },
  wilted: { opacity: 0.75 },
  wiltChip: { paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: glass.here },
  wiltText: { color: glass.text, fontSize: 10.5, fontWeight: "700" },
  days: { flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: glass.rowPressed },
  daysText: { color: glass.text, fontSize: 11, fontWeight: "800" },
  empty: { alignItems: "center", gap: 8, paddingVertical: 14 },
  emptyText: { color: glass.text, fontFamily: fonts.display, fontSize: 16 },
  balance: { flexDirection: "row", alignItems: "center", gap: 4, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: glass.row },
  balanceText: { color: gold.light, fontFamily: fonts.display, fontSize: 14 },
  offer: { alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 16 },
  plotPicture: { width: 96, height: 64, borderRadius: 12, backgroundColor: hud.primarySoft, alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderColor: hud.forest },
  plotSoil: { position: "absolute", left: 10, right: 10, top: 10, bottom: 10, borderRadius: 6, borderWidth: 3, borderColor: hud.accent, borderStyle: "dashed" },
  plotNumber: { color: hud.forest, fontFamily: fonts.display, fontSize: 22 },
  offerTitle: { color: glass.text, fontFamily: fonts.display, fontSize: 18 },
  error: { color: glass.error, fontSize: 12.5, textAlign: "center" },
  buy: { flexDirection: "row", alignItems: "center", gap: 6, height: 42, paddingHorizontal: 18, borderRadius: 21, backgroundColor: hud.accent },
  buyOff: { opacity: 0.45 },
  buyText: { color: hud.onAccent, fontWeight: "800", fontSize: 15 },
  herd: { flexDirection: "row", gap: 4, alignItems: "flex-end" },
  facts: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  fact: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: glass.row },
  factText: { color: glass.text, fontSize: 12, fontWeight: "700" },
  iconText: { fontSize: 18 },
  animalRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, backgroundColor: glass.row },
  animalText: { flex: 1, gap: 1 },
  renameBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  newRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 16, borderWidth: 2, borderStyle: "dashed", borderColor: glass.edge },
  input: { flex: 1, height: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: glass.rowPressed, color: glass.text, fontSize: 15, fontWeight: "700" },
  tagButton: { flexDirection: "row", alignItems: "center", gap: 4, height: 38, paddingHorizontal: 10, borderRadius: 19, backgroundColor: hud.accent },
  tagButtonText: { color: hud.onAccent, fontWeight: "800", fontSize: 14 },
  renameButton: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: glass.rowPressed },
  renameText: { color: glass.text, fontWeight: "800", fontSize: 13 },
  buySmall: { flexDirection: "row", alignItems: "center", gap: 5, height: 38, paddingHorizontal: 12, borderRadius: 19, backgroundColor: hud.accent },
});
