import { Ionicons } from "@expo/vector-icons";
import * as Linking from "expo-linking";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { universityColour } from "../../../shared/flow";
import { radius, spacing, typography, useAppTheme } from "@/theme";
import { CampusMark } from "@/components/CampusMark";
import { Btn, Card, FadeInView, Muted, SectionTitle, stagger, Txt } from "@/components/ui";
import {
  CAMPUS_MEETING_NOTE,
  CAMPUSES,
  CHRISTIAN_PSYCHOLOGISTS,
  CONTACT_EMAIL,
  HELPLINES,
  LINKS,
  MISSION_STATEMENT,
  RESOURCE_WEBSITES,
  SOCIALS,
  VALUES,
} from "./content";

const open = (url: string) => void Linking.openURL(url);

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
        <SectionTitle>Get involved</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(7)}>
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

      <FadeInView delay={stagger(8)}>
        <SectionTitle>Follow along</SectionTitle>
      </FadeInView>
      <FadeInView delay={stagger(9)}>
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
          Websites, counsellors and helplines we often point people to — the
          same list as THE SHED on the web.
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

/* ───────────────────────────── Campuses ───────────────────────────── */

export const CampusesTab = () => {
  const t = useAppTheme();
  return (
    <View style={styles.page}>
      <FadeInView delay={40}>
        <Muted>{CAMPUS_MEETING_NOTE}</Muted>
      </FadeInView>
      {CAMPUSES.map((campus, i) => (
        <FadeInView key={campus.name} delay={stagger(i + 1)}>
          <View
            style={[
              styles.campusCard,
              t.shadowCard,
              {
                backgroundColor: t.card,
                borderLeftColor: universityColour(campus.name) ?? t.primary,
              },
            ]}
          >
            <View style={styles.campusHeader}>
              <CampusMark campus={campus.name} size="sm" logoSource="university" />
              <Txt style={styles.campusName} numberOfLines={2}>
                {campus.name}
              </Txt>
            </View>
            <Muted>{campus.blurb}</Muted>
          </View>
        </FadeInView>
      ))}
      <FadeInView delay={stagger(CAMPUSES.length + 1)}>
        <Card>
          <Txt style={styles.cardTitle}>Find your campus meetup</Txt>
          <Muted>
            Meeting spots and times move around the semester, so message us on
            Instagram or email {CONTACT_EMAIL} and we&apos;ll point you to your
            campus&apos;s next Weekly Meeting.
          </Muted>
          <View style={styles.buttonRow}>
            <Btn
              title="Message on Instagram"
              variant="tonal"
              onPress={() => open(SOCIALS[0].url)}
            />
            <Btn title="sow.org.au/students" variant="ghost" onPress={() => open(LINKS.students)} />
          </View>
        </Card>
      </FadeInView>
    </View>
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
        "Partner with us in prayer — our monthly newsletters share what's " +
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
        "Lend your time and skills — from events to design and media. Tell us " +
        "how you'd love to serve.",
      action: { title: "Volunteer", url: LINKS.volunteer },
    },
  ];
  return (
    <View style={styles.page}>
      <FadeInView delay={40}>
        <Muted>
          SOW is a ministry carried by its partners — here are the ways you can
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
    </View>
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
  campusCard: {
    borderRadius: radius.lg,
    borderLeftWidth: 4,
    paddingHorizontal: spacing.lg - 2,
    paddingVertical: spacing.lg - 2,
    gap: spacing.sm,
  },
  campusHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  campusName: { fontSize: 16, fontWeight: "700", flex: 1 },
  newsletterCard: {
    borderRadius: radius.lg,
    padding: spacing.lg + 2,
    gap: spacing.sm + 2,
  },
});
