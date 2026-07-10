import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import * as Linking from "expo-linking";
import { Alert, Pressable, StyleSheet, Text, View, Image } from "react-native";
import { api } from "../../../convex/_generated/api";
import { universityColour } from "../../../shared/flow";
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
import {
  CAMPUS_MEETING_NOTE,
  CAMPUS_PROGRAMS,
  CAMPUSES,
  type Campus,
  CHRISTIAN_PSYCHOLOGISTS,
  CONTACT_EMAIL,
  HELPLINES,
  KEY_EVENTS,
  LINKS,
  MISSION_STATEMENT,
  OUR_STORY,
  REAP,
  RESOURCE_WEBSITES,
  SEASONS,
  SOCIALS,
  VALUES,
} from "./content";

// External links / tel: / mailto: can reject when no handler exists (or the
// scheme is blocked). Catch it so it doesn't become an unhandled rejection and
// give the user a hint instead of silently doing nothing.
const open = (url: string) =>
  void Linking.openURL(url).catch(() =>
    Alert.alert("Couldn't open this", "Please try again or use a different device.")
  );

/** A tappable external-link row: name on the left, open-out glyph on the right. */
const LinkRow = ({ name, url, sub }: { name: string; url: string; sub?: string }) => {
  const t = useAppTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open ${name}`}
      onPress={() => open(url)}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
    >
      <View style={styles.linkRowText}>
        <Txt style={styles.linkRowName} numberOfLines={1}>
          {name}
        </Txt>
        {sub ? (
          <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name="open-outline" size={16} color={t.faint} />
    </Pressable>
  );
};

/* ─────────────────────────────── Home ─────────────────────────────── */

export const HomeMissionTab = () => {
  const t = useAppTheme();
  return (
    <View style={styles.page}>
      <FadeInView delay={40}>
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
          <Text style={[typography.label, { color: t.muted }]}>
            Student Outreach to the World
          </Text>
          <Text style={[styles.mission, { color: t.text }]}>{MISSION_STATEMENT}</Text>
        </View>
      </FadeInView>

      <FadeInView delay={stagger(1)}>
        <SectionTitle>Our values</SectionTitle>
      </FadeInView>
      {VALUES.map((value, i) => (
        <FadeInView key={value.name} delay={stagger(i + 2)}>
          <Card>
            <View style={styles.valueRow}>
              <View style={[styles.valueDot, { backgroundColor: t.accent }]} />
              <Txt style={styles.valueName}>{value.name}</Txt>
            </View>
            <Muted>{value.line}</Muted>
          </Card>
        </FadeInView>
      ))}

      <FadeInView delay={stagger(6)}>
        <SectionTitle>Our story</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(7)}>
        <Card>
          {OUR_STORY.map((para, i) => (
            <Muted key={i}>{para}</Muted>
          ))}
          <View style={styles.buttonRow}>
            <Btn title="Read our story" variant="ghost" onPress={() => open(LINKS.story)} />
          </View>
        </Card>
      </FadeInView>

      <FadeInView delay={stagger(8)}>
        <SectionTitle>Get involved</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(9)}>
        <Card>
          <Txt style={styles.cardTitle}>Volunteer with SOW</Txt>
          <Muted>
            From organising events to design and media, there are plenty of ways
            to serve. Express your interest and we&apos;ll find the right fit.
          </Muted>
          <View style={styles.buttonRow}>
            <Btn title="Learn more" variant="tonal" onPress={() => open(LINKS.volunteer)} />
            <Btn
              title="Email us"
              variant="ghost"
              onPress={() => open(`mailto:${CONTACT_EMAIL}`)}
            />
          </View>
        </Card>
      </FadeInView>

      <FadeInView delay={stagger(10)}>
        <SectionTitle>Follow along</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(11)}>
        <Card>
          <View style={styles.socialRow}>
            {SOCIALS.map((social) => (
              <Pressable
                key={social.key}
                accessibilityRole="link"
                accessibilityLabel={`Open ${social.label}`}
                onPress={() => open(social.url)}
                style={({ pressed }) => [
                  styles.socialButton,
                  { backgroundColor: t.ghost },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name={social.icon} size={22} color={t.ghostText} />
              </Pressable>
            ))}
          </View>
          <Text style={[typography.caption, styles.socialCaption, { color: t.muted }]}>
            @studentoutreachtotheworld · {CONTACT_EMAIL}
          </Text>
        </Card>
      </FadeInView>
    </View>
  );
};

/* ───────────────────────────── Resources ──────────────────────────── */

export const ResourcesTab = () => {
  const t = useAppTheme();
  return (
    <View style={styles.page}>
      <FadeInView delay={40}>
        <Muted>
          Websites, counsellors and helplines we often point people to, the
          same list THE SHED uses on the web.
        </Muted>
      </FadeInView>
      <FadeInView delay={stagger(1)}>
        <SectionTitle>Websites</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(2)}>
        <Card>
          {RESOURCE_WEBSITES.map((site) => (
            <LinkRow key={site.name} name={site.name} url={site.link} />
          ))}
        </Card>
      </FadeInView>
      <FadeInView delay={stagger(3)}>
        <SectionTitle>Christian psychologists</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(4)}>
        <Card>
          {CHRISTIAN_PSYCHOLOGISTS.map((cp) => (
            <LinkRow key={cp.name} name={cp.name} url={cp.link} />
          ))}
        </Card>
      </FadeInView>
      <FadeInView delay={stagger(5)}>
        <SectionTitle>Helplines</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(6)}>
        <Card>
          {HELPLINES.map((line) => (
            <Pressable
              key={line.name}
              accessibilityRole="link"
              accessibilityLabel={`Call ${line.name} on ${line.phoneNumber}`}
              onPress={() => open(`tel:${line.phoneNumber.replace(/\s/g, "")}`)}
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.5 }]}
            >
              <View style={styles.linkRowText}>
                <Txt style={styles.linkRowName}>{line.name}</Txt>
                <Text style={[typography.caption, { color: t.muted }]}>
                  {line.phoneNumber}
                </Text>
              </View>
              <Ionicons name="call-outline" size={16} color={t.faint} />
            </Pressable>
          ))}
        </Card>
      </FadeInView>
    </View>
  );
};

/* ───────────────────────────── Connect ───────────────────────────── */

export const CampusesTab = () => {
  const t = useAppTheme();
  const [selected, setSelected] = useState<Campus | null>(null);
  const base = CAMPUSES.length;
  return (
    <View style={styles.page}>
      <FadeInView delay={40}>
        <Muted>
          Find your campus below to see where and when SOW gathers each week.
        </Muted>
      </FadeInView>
      {CAMPUSES.map((campus, i) => (
        <FadeInView key={campus.slug} delay={stagger(i + 1)}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${campus.name}, open details`}
            onPress={() => setSelected(campus)}
            style={({ pressed }) => [
              styles.connectCard,
              t.shadowCard,
              { backgroundColor: t.card, borderLeftColor: universityColour(campus.name) ?? t.primary },
              pressed && { opacity: 0.6 },
            ]}
          >
            <View style={styles.connectHeader}>
              <CampusMark
                campus={campus.name}
                logoSource="university"
                variant="circle"
                circleDiameter={40}
              />
              <View style={styles.connectHeaderText}>
                <Txt style={styles.connectName} numberOfLines={1}>
                  {campus.name}
                </Txt>
                <Text style={[typography.caption, { color: t.muted }]} numberOfLines={1}>
                  {campus.short}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.faint} />
            </View>
          </Pressable>
        </FadeInView>
      ))}

      {/* What a Weekly Meeting actually is — sits between the campuses and the
          other programs since every campus runs one. */}
      <FadeInView delay={stagger(base + 1)}>
        <SectionTitle>Weekly Meeting</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(base + 2)}>
        <Card>
          <Muted>{CAMPUS_MEETING_NOTE}</Muted>
        </Card>
      </FadeInView>

      {/* REAP runs at every campus, but each works through its own material, so
          it sits on its own rather than under a single campus card. */}
      <FadeInView delay={stagger(base + 3)}>
        <SectionTitle>{REAP.name}</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(base + 4)}>
        <Card>
          <Muted>{REAP.line}</Muted>
        </Card>
      </FadeInView>

      {/* Seasons is the biblical training course hosted at WSU. */}
      <FadeInView delay={stagger(base + 5)}>
        <SectionTitle>{SEASONS.name}</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(base + 6)}>
        <Card>
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: spacing.sm,
              }}
            >
              <CampusMark
                campus={SEASONS.campus}
                logoSource="university"
                variant="circle"
                circleDiameter={32}
              />
              <Txt style={styles.cardTitle}>{SEASONS.campus}</Txt>
            </View>
            <Muted>{SEASONS.line}</Muted>
          </View>
        </Card>
      </FadeInView>

      {/* Key events are run for the whole ministry, not per campus. */}
      <FadeInView delay={stagger(base + 7)}>
        <SectionTitle>Key events</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(base + 8)}>
        <Card>
          <View style={{ gap: spacing.sm }}>
            {KEY_EVENTS.map((event) => (
              <View key={event.name} style={{ gap: 2 }}>
                <Txt style={styles.cardTitle}>{event.name}</Txt>
                <Muted>{event.line}</Muted>
              </View>
            ))}
          </View>
        </Card>
      </FadeInView>

      <FadeInView delay={stagger(base + 9)}>
        <Card>
          <Txt style={styles.cardTitle}>New to a campus?</Txt>
          <Muted>
            Message your campus on Instagram from its card above, or email{" "}
            {CONTACT_EMAIL} and we&apos;ll help you find your first Weekly
            Meeting.
          </Muted>
          <View style={styles.buttonRow}>
            <Btn
              title="Email us"
              variant="tonal"
              icon="mail-outline"
              onPress={() => open(`mailto:${CONTACT_EMAIL}`)}
            />
            <Btn title="sow.org.au/students" variant="ghost" onPress={() => open(LINKS.students)} />
          </View>
        </Card>
      </FadeInView>

      <CampusDetailModal campus={selected} onClose={() => setSelected(null)} />
    </View>
  );
};

const CampusDetailModal = ({
  campus,
  onClose,
}: {
  campus: Campus | null;
  onClose: () => void;
}) => {
  const t = useAppTheme();
  const isWsu = campus?.slug === "wsu";
  return (
    <Sheet visible={!!campus} onClose={onClose} title={campus ? campus.name : ""}>
      {campus ? (
        <View style={{ gap: spacing.md }}>
          {campus.about.map((para) => (
            <Muted key={para}>{para}</Muted>
          ))}
          <View style={{ gap: spacing.xs }}>
            <Text style={[typography.label, { color: t.muted }]}>
              {isWsu ? SEASONS.name : "Weekly Meeting"}
            </Text>
            <Text style={[typography.body, { color: t.text }]}>
              {isWsu
                ? SEASONS.line
                : campus.meeting
                  ? `${campus.meeting.day} · ${campus.meeting.time}\n${campus.meeting.location}`
                  : "Meetups move around the semester. Contact us and we’ll point you to this term’s Weekly Meeting."}
            </Text>
          </View>
          {!isWsu ? (
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.label, { color: t.muted }]}>Programs</Text>
              <View style={{ gap: 4 }}>
                {CAMPUS_PROGRAMS.map((program) => (
                  <Text key={program.name} style={[typography.body, { color: t.text }]}>
                    • {program.name}
                  </Text>
                ))}
              </View>
            </View>
          ) : null}
          <Btn
            title={`Follow @${campus.instagram}`}
            variant="tonal"
            icon="logo-instagram"
            onPress={() => open(`https://www.instagram.com/${campus.instagram}/`)}
          />
        </View>
      ) : null}
    </Sheet>
  );
};

/* ────────────────────────────── Partner ───────────────────────────── */

export const PartnerTab = () => {
  const t = useAppTheme();
  const ways: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    blurb: string;
    action: { title: string; url: string };
  }[] = [
    {
      key: "pray",
      icon: "heart-outline",
      title: "Pray",
      blurb:
        "Partner with us in prayer. Our monthly newsletters share what's " +
        "happening across our campuses and how to pray for it.",
      action: { title: "Prayer updates", url: LINKS.pray },
    },
    {
      key: "give",
      icon: "gift-outline",
      title: "Give",
      blurb:
        "SOW is sustained by generous supporters. One-off or weekly gifts both " +
        "go a long way in reaching students.",
      action: { title: "Donate", url: LINKS.donate },
    },
    {
      key: "volunteer",
      icon: "hand-left-outline",
      title: "Volunteer",
      blurb:
        "Lend your time and skills, from events to design and media. Tell us " +
        "how you'd love to serve.",
      action: { title: "Volunteer", url: LINKS.volunteer },
    },
  ];
  return (
    <View style={styles.page}>
      <FadeInView delay={40}>
        <Muted>
          SOW is a ministry carried by its partners. Here are the ways you can
          stand with us.
        </Muted>
      </FadeInView>
      {ways.map((way, i) => (
        <FadeInView key={way.key} delay={stagger(i + 1)}>
          <Card>
            <View style={styles.valueRow}>
              <Ionicons name={way.icon} size={18} color={t.accent} />
              <Txt style={styles.cardTitle}>{way.title}</Txt>
            </View>
            <Muted>{way.blurb}</Muted>
            <View style={styles.buttonRow}>
              <Btn title={way.action.title} variant="tonal" onPress={() => open(way.action.url)} />
            </View>
          </Card>
        </FadeInView>
      ))}
      <FadeInView delay={stagger(4)}>
        <View
          style={[
            styles.newsletterCard,
            t.shadowCard,
            { backgroundColor: t.primary },
          ]}
        >
          <Txt style={[styles.cardTitle, { color: t.onPrimary }]}>
            Subscribe to our newsletter
          </Txt>
          <Text style={[typography.body, { color: t.onPrimary, opacity: 0.85 }]}>
            Monthly news and updates from across our campuses, straight to your
            inbox.
          </Text>
          <View style={styles.buttonRow}>
            <Btn title="Sign up" variant="ghost" onPress={() => open(LINKS.newsletterSignup)} />
          </View>
        </View>
      </FadeInView>

      <ContactCard />
    </View>
  );
};

/**
 * "Contact us" form: emails {@link CONTACT_EMAIL} and sends the sender a
 * confirmation (see convex/contact.ts). Signed-in users send from their locked
 * account email; visitors type one in. On success we clear the message (and the
 * email, unless it's a signed-in account) and show a confirmation sheet.
 */
const ContactCard = () => {
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
      <FadeInView delay={stagger(5)}>
        <Card>
          <Txt style={styles.cardTitle}>Contact us</Txt>
          <Muted>
            Questions, prayer requests, or just want to say hi? Send us a message
            and we&apos;ll get back to you.
          </Muted>
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
      </FadeInView>

      <Sheet visible={sent} onClose={() => setSent(false)} title="Message sent">
        <View style={{ gap: spacing.sm }}>
          <Txt>Thanks for reaching out — we&apos;ve received your message.</Txt>
          <Muted>
            You&apos;ll receive a reply within 2-3 business days. A confirmation
            has been sent to your email too.
          </Muted>
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
    textAlign: "center",
    lineHeight: 30,
    maxWidth: 560,
  },
  valueRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  valueDot: { width: 8, height: 8, borderRadius: 4 },
  valueName: { fontSize: 16, fontWeight: "700" },
  cardTitle: { fontSize: 16, fontWeight: "700" },
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
  connectName: { fontSize: 16, fontWeight: "700" },
  newsletterCard: {
    borderRadius: radius.lg,
    padding: spacing.lg + 2,
    gap: spacing.sm + 2,
  },
});
