import { useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMutation, useQuery } from "convex/react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Alert, Pressable, StyleSheet, Text, View, Image } from "react-native";
import { api } from "../../../convex/_generated/api";
import { universityColour } from "../../../shared/flow";
import {
  type HomeBlock,
  type HomeButton,
  type HomeCampus,
  type HomeLink,
  paragraphs,
} from "../../../shared/homeContent";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { CampusMark } from "@/components/CampusMark";
import {
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  FadeInView,
  Field,
  Muted,
  SectionTitle,
  stagger,
  Txt,
} from "@/components/ui";
import { Sheet } from "@/components/ui/overlays";

type IconName = keyof typeof Ionicons.glyphMap;

const iconOr = (name: string | undefined, fallback: IconName): IconName =>
  name && name in Ionicons.glyphMap ? (name as IconName) : fallback;

const open = (url: string) =>
  void Linking.openURL(url).catch(() =>
    Alert.alert("Couldn't open this", "Please try again or use a different device.")
  );

export function HomeBlocks({ blocks }: { blocks: HomeBlock[] }) {
  return (
    <View style={styles.page}>
      {groupListCards(blocks).map((item, i) => {
        const node = Array.isArray(item) ? <ListCard blocks={item} /> : renderBlock(item, i);
        return node ? (
          <FadeInView key={i} delay={i === 0 ? 40 : stagger(i)}>
            {node}
          </FadeInView>
        ) : null;
      })}
    </View>
  );
}

type CardBlock = Extract<HomeBlock, { type: "card" }>;

const isListItem = (block: HomeBlock): block is CardBlock =>
  block.type === "card" &&
  block.tone !== "primary" &&
  Boolean(block.dot) &&
  !block.icon &&
  !block.campus &&
  block.buttons.length === 0;

const groupListCards = (blocks: HomeBlock[]): (HomeBlock | CardBlock[])[] => {
  const out: (HomeBlock | CardBlock[])[] = [];
  for (const block of blocks) {
    const last = out[out.length - 1];
    if (isListItem(block) && Array.isArray(last)) last.push(block);
    else out.push(isListItem(block) ? [block] : block);
  }
  return out.map((item) => (Array.isArray(item) && item.length === 1 ? item[0] : item));
};

const ListCard = ({ blocks }: { blocks: CardBlock[] }) => {
  const t = useAppTheme();
  return (
    <Card style={{ paddingVertical: spacing.xs, gap: 0 }}>
      {blocks.map((block, i) => (
        <View
          key={i}
          style={[styles.listItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.separator }]}
        >
          {block.title ? (
            <View style={styles.titleRow}>
              <View style={[styles.dot, { backgroundColor: t.accent }]} />
              <Txt style={styles.cardTitle}>{block.title}</Txt>
            </View>
          ) : null}
          {paragraphs(block.body).map((para, j) => (
            <Muted key={j}>{para}</Muted>
          ))}
        </View>
      ))}
    </Card>
  );
};

const renderBlock = (block: HomeBlock, index: number) => {
  switch (block.type) {
    case "hero":
      return <Hero eyebrow={block.eyebrow} text={block.text} />;
    case "heading":
      return <SectionTitle>{block.text}</SectionTitle>;
    case "text":
      return <Muted>{block.text}</Muted>;
    case "card":
      return <HomeCard block={block} />;
    case "links":
      return block.links.length > 0 ? (
        <Card>
          {block.links.map((link, i) => (
            <LinkRow key={`${index}-${i}`} link={link} />
          ))}
        </Card>
      ) : null;
    case "socials":
      return <Socials links={block.links} caption={block.caption} />;
    case "campuses":
      return <Campuses campuses={block.campuses} />;
    case "contact":
      return (
        <View style={styles.page}>
          <ContactCard title={block.title} body={block.body} />
          <GrievanceCard />
        </View>
      );
    default:
      return null;
  }
};

const Hero = ({ eyebrow, text }: { eyebrow: string; text: string }) => {
  const t = useAppTheme();
  return (
    <View style={styles.hero}>
      <Image
        source={
          t.dark
            ? require("../../../assets/images/mark-cream.png")
            : require("../../../assets/images/mark-dark.png")
        }
        style={styles.heroMark}
        resizeMode="contain"
      />
      {eyebrow ? (
        <Text style={[typography.label, { color: t.muted }]}>{eyebrow}</Text>
      ) : null}
      <Text style={[styles.mission, { color: t.text }]}>{text}</Text>
    </View>
  );
};

const Buttons = ({ buttons, onPrimary }: { buttons: HomeButton[]; onPrimary?: boolean }) =>
  buttons.length > 0 ? (
    <View style={styles.buttonRow}>
      {buttons.map((button, i) => (
        <Btn
          key={i}
          title={button.label}
          variant={onPrimary && button.style === "primary" ? "ghost" : button.style}
          icon={button.icon ? iconOr(button.icon, "open-outline") : undefined}
          onPress={() => open(button.url)}
        />
      ))}
    </View>
  ) : null;

const HomeCard = ({ block }: { block: Extract<HomeBlock, { type: "card" }> }) => {
  const t = useAppTheme();
  const body = paragraphs(block.body);
  if (block.tone === "primary") {
    return (
      <View style={[styles.featureCard, t.surfaceEdge, { backgroundColor: t.primary }]}>
        {block.title ? (
          <Txt style={[styles.cardTitle, { color: t.onPrimary }]}>{block.title}</Txt>
        ) : null}
        {body.map((para, i) => (
          <Text key={i} style={[typography.body, { color: t.onPrimary, opacity: 0.85 }]}>
            {para}
          </Text>
        ))}
        <Buttons buttons={block.buttons} onPrimary />
      </View>
    );
  }
  const marker = block.campus ? (
    <CampusMark campus={block.campus} logoSource="university" circleDiameter={32} />
  ) : block.icon ? (
    <Ionicons name={iconOr(block.icon, "ellipse-outline")} size={18} color={t.accent} />
  ) : block.dot ? (
    <View style={[styles.dot, { backgroundColor: t.accent }]} />
  ) : null;
  return (
    <Card>
      {block.title ? (
        <View style={styles.titleRow}>
          {marker}
          <Txt style={styles.cardTitle}>{block.title}</Txt>
        </View>
      ) : null}
      {body.map((para, i) => (
        <Muted key={i}>{para}</Muted>
      ))}
      <Buttons buttons={block.buttons} />
    </Card>
  );
};

const LinkRow = ({ link }: { link: HomeLink }) => {
  const t = useAppTheme();
  const isPhone = link.url.startsWith("tel:");
  const isMail = link.url.startsWith("mailto:");
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        isPhone ? `Call ${link.name}${link.note ? ` on ${link.note}` : ""}` : `Open ${link.name}`
      }
      onPress={() => open(link.url)}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
    >
      <View style={styles.linkRowText}>
        <Txt style={styles.linkRowName} numberOfLines={isPhone ? undefined : 1}>
          {link.name}
        </Txt>
        {link.note ? (
          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
            {link.note}
          </Text>
        ) : null}
      </View>
      <Ionicons
        name={isPhone ? "call-outline" : isMail ? "mail-outline" : "open-outline"}
        size={16}
        color={t.faint}
      />
    </Pressable>
  );
};

const Socials = ({
  links,
  caption,
}: {
  links: Extract<HomeBlock, { type: "socials" }>["links"];
  caption: string;
}) => {
  const t = useAppTheme();
  return (
    <Card>
      <View style={styles.socialRow}>
        {links.map((social, i) => (
          <Pressable
            key={i}
            accessibilityRole="link"
            accessibilityLabel={`Open ${social.label}`}
            onPress={() => open(social.url)}
            style={({ pressed }) => [
              styles.socialButton,
              { backgroundColor: t.ghost },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Ionicons name={iconOr(social.icon, "link-outline")} size={22} color={t.ghostText} />
          </Pressable>
        ))}
      </View>
      {caption ? (
        <Text style={[typography.caption, styles.socialCaption, { color: t.muted }]}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
};

const Campuses = ({ campuses }: { campuses: HomeCampus[] }) => {
  const t = useAppTheme();
  const [selected, setSelected] = useState<HomeCampus | null>(null);
  return (
    <View style={styles.page}>
      {campuses.map((campus, i) => (
        <FadeInView key={`${campus.name}-${i}`} delay={stagger(i)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${campus.name}, open details`}
            onPress={() => setSelected(campus)}
            style={({ pressed }) => [
              styles.connectCard,
              t.surfaceEdge,
              {
                backgroundColor: t.card,
                borderLeftColor: universityColour(campus.name) ?? t.primary,
              },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={styles.connectHeader}>
              <CampusMark
                campus={campus.name}
                logoSource="university"
                circleDiameter={40}
              />
              <View style={styles.connectHeaderText}>
                <Txt style={styles.cardTitle} numberOfLines={1}>
                  {campus.name}
                </Txt>
                {campus.short ? (
                  <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                    {campus.short}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.faint} />
            </View>
          </Pressable>
        </FadeInView>
      ))}
      <CampusDetailSheet campus={selected} onClose={() => setSelected(null)} />
    </View>
  );
};

const CampusDetailSheet = ({
  campus,
  onClose,
}: {
  campus: HomeCampus | null;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  return (
    <Sheet visible={!!campus} onClose={onClose} title={campus ? campus.name : ""}>
      {campus ? (
        <View style={{ gap: spacing.md }}>
          {paragraphs(campus.about).map((para, i) => (
            <Muted key={i}>{para}</Muted>
          ))}
          {campus.meeting ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.label, { color: t.muted }]}>
                {campus.meetingLabel || "Weekly Meeting"}
              </Text>
              <Text style={[typography.body, { color: t.text }]}>{campus.meeting}</Text>
            </View>
          ) : null}
          {campus.programs.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.label, { color: t.muted }]}>Programs</Text>
              <View style={{ gap: 4 }}>
                {campus.programs.map((program, i) => (
                  <Text key={i} style={[typography.body, { color: t.text }]}>
                    • {program}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
          {campus.instagram ? (
            <Btn
              title={`Follow @${campus.instagram}`}
              variant="tonal"
              icon="logo-instagram"
              onPress={() => open(`https://www.instagram.com/${campus.instagram}/`)}
            />
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
};

const GrievanceCard = () => {
  const router = useRouter();
  return (
    <Card>
      <Txt style={styles.cardTitle}>Raise a grievance</Txt>
      <Muted>
        Something wrong that you&apos;d like SOW to look into? Tell our People and Culture and
        Compliance teams in confidence. We&apos;ll email you as it moves along.
      </Muted>
      <View style={styles.buttonRow}>
        <Btn
          title="Raise a grievance"
          variant="tonal"
          icon="shield-checkmark-outline"
          onPress={() => router.push("/grievances/new")}
        />
      </View>
    </Card>
  );
};

const ContactCard = ({ title, body }: { title: string; body: string }) => {
  const me = useQuery(api.directory.me);
  const submit = useMutation(api.contact.submit);
  const signedInEmail = me?.email ?? null;

  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const effectiveEmail = signedInEmail ?? email;
  const canSend =
    effectiveEmail.trim().length > 0 && message.trim().length > 0 && !sending;

  const onSend = async () => {
    setError(null);
    setSending(true);
    try {
      await submit({ email: effectiveEmail.trim(), message: message.trim() });
      setMessage("");
      if (!signedInEmail) setEmail("");
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Card>
        <Txt style={styles.cardTitle}>{title}</Txt>
        {body ? <Muted>{body}</Muted> : null}
        <Field
          label="Your email"
          value={effectiveEmail}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          disabled={!!signedInEmail}
        />
        <Field
          label="Message"
          value={message}
          onChangeText={setMessage}
          placeholder="How can we help?"
          multiline
        />
        {error ? <ErrorBanner message={error} /> : null}
        <View style={styles.buttonRow}>
          <Btn
            title="Send message"
            onPress={() => void onSend()}
            loading={sending}
            disabled={!canSend}
          />
        </View>
      </Card>

      <Sheet visible={sent} onClose={() => setSent(false)} title="Message sent">
        <View style={{ gap: spacing.sm }}>
          <Txt>Thanks for reaching out. We&apos;ll reply within 2-3 business days.</Txt>
          <View style={styles.buttonRow}>
            <Btn title="Done" onPress={() => setSent(false)} />
          </View>
        </View>
      </Sheet>
    </>
  );
};

const styles = StyleSheet.create({
  page: { gap: spacing.md },
  hero: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.lg },
  heroMark: { width: 72, height: 72 },
  mission: {
    ...typography.title,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.5,
    textAlign: "center",
    maxWidth: 560,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { ...typography.headline },
  listItem: { gap: spacing.xs, paddingVertical: spacing.md },
  buttonRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  socialRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  socialButton: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  socialCaption: { marginTop: spacing.xs },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 6,
  },
  linkRowText: { flex: 1, gap: 1 },
  linkRowName: { fontSize: 15 },
  connectCard: {
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.lg - 2,
    gap: spacing.sm,
  },
  connectHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  connectHeaderText: { flex: 1, gap: 1 },
  featureCard: {
    borderRadius: radius.lg,
    padding: spacing.lg + 2,
    gap: spacing.sm + 2,
  },
});
