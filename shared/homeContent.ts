import { departmentsOf, type ProfileLike } from "./flow";

// The Home tab, laid out on the server like Insights (see
// attendanceMetricsView.ts). Each sub-tab is a list of typed blocks the app
// draws; admins and Marketing staff edit them in the app, and a tab nobody has
// edited shows the defaults below.

export const MARKETING_DEPARTMENT = "Marketing";
export const ENGAGEMENT_DIVISION = "Engagement";

export const HOME_TABS = [
  { key: "home", label: "Home" },
  { key: "resources", label: "Resources" },
  { key: "connect", label: "Connect" },
  { key: "partner", label: "Partner" },
] as const;

export type HomeTabKey = (typeof HOME_TABS)[number]["key"];

export const isHomeTabKey = (key: string): key is HomeTabKey =>
  HOME_TABS.some((tab) => tab.key === key);

export type HomeButtonStyle = "primary" | "tonal" | "ghost";

export type HomeButton = {
  label: string;
  url: string;
  style: HomeButtonStyle;
  icon?: string;
};

export type HomeLink = { name: string; url: string; note?: string };

export type HomeSocial = { label: string; icon: string; url: string };

export type HomeCampus = {
  name: string;
  short: string;
  /** Paragraphs, separated by a blank line. */
  about: string;
  meetingLabel: string;
  /** Lines shown under the meeting label, e.g. day/time then location. */
  meeting: string;
  programs: string[];
  instagram: string;
};

export type HomeBlock =
  | { type: "hero"; eyebrow: string; text: string }
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | {
      type: "card";
      title: string;
      body: string;
      icon?: string;
      dot?: boolean;
      campus?: string;
      tone?: "default" | "primary";
      buttons: HomeButton[];
    }
  | { type: "links"; links: HomeLink[] }
  | { type: "socials"; caption: string; links: HomeSocial[] }
  | { type: "campuses"; campuses: HomeCampus[] }
  | { type: "contact"; title: string; body: string };

export type HomeBlockType = HomeBlock["type"];

export const HOME_BLOCK_LABELS: Record<HomeBlockType, string> = {
  hero: "Logo and headline",
  heading: "Section heading",
  text: "Intro text",
  card: "Card",
  links: "Links and phone numbers",
  socials: "Social buttons",
  campuses: "Campus list",
  contact: "Contact form",
};

/** Icons the editor offers; the app falls back to a neutral icon for others. */
export const HOME_ICONS = [
  "heart-outline",
  "gift-outline",
  "hand-left-outline",
  "people-outline",
  "book-outline",
  "calendar-outline",
  "megaphone-outline",
  "star-outline",
  "school-outline",
  "mail-outline",
  "call-outline",
  "globe-outline",
  "link-outline",
  "logo-instagram",
  "logo-facebook",
  "logo-linkedin",
  "logo-youtube",
  "logo-tiktok",
  "musical-notes",
] as const;

export const CONTACT_EMAIL = "info@sowaustralia.com";

const LINKS = {
  story: "https://www.sow.org.au/our-story",
  students: "https://www.sow.org.au/students",
  volunteer: "https://www.sow.org.au/volunteer",
  pray: "https://www.sow.org.au/pray",
  newsletterSignup:
    "https://sowaustralia.us1.list-manage.com/subscribe?id=e86a4d965e&u=2213560fe40053caf2afa63b6",
  donate: "https://donorbox.org/sow-support-us?default_interval=w",
};

const CAMPUS_PROGRAMS = ["Weekly Meetings", "Road Trips"];

const SEASONS_LINE =
  "SOW’s biblical training program at Western Sydney University. Come " +
  "along to open God’s word with teaching, discussion and practical " +
  "application. Follow @sowwsu for updates.";

const DEFAULT_CAMPUSES: HomeCampus[] = [
  {
    name: "University of Sydney",
    short: "Tuesdays 5-7pm, Camperdown campus.",
    about:
      "SOW at the University of Sydney gathers students from across the Camperdown campus to grow together as disciples of Jesus.\n\n" +
      "Each week we meet to open God’s word together, with optional dinner afterwards, and throughout the week we run small groups and share life as a community.",
    meetingLabel: "Weekly Meeting",
    meeting: "Tuesdays · 5-7pm\nCamperdown campus (room announced each term)",
    programs: CAMPUS_PROGRAMS,
    instagram: "sowusyd",
  },
  {
    name: "University of New South Wales",
    short: "Wednesdays 5-7pm, Kensington campus.",
    about:
      "SOW at UNSW brings together students on the Kensington campus around the gospel, learning from God’s word and encouraging one another.\n\n" +
      "Our weekly meeting is the heart of the community, with optional dinner afterwards and small groups running through the week.",
    meetingLabel: "Weekly Meeting",
    meeting: "Wednesdays · 5-7pm\nKensington campus (room announced each term)",
    programs: CAMPUS_PROGRAMS,
    instagram: "sowunsw",
  },
  {
    name: "University of Technology, Sydney",
    short: "Tuesdays 5-7pm, Broadway campus.",
    about:
      "SOW at UTS meets around the Broadway campus in the heart of the city, welcoming students to explore and follow Jesus together.\n\n" +
      "We gather each week, with optional dinner afterwards, and run small groups through the week to grow in faith and friendship.",
    meetingLabel: "Weekly Meeting",
    meeting: "Tuesdays · 5-7pm\nBroadway campus (room announced each term)",
    programs: CAMPUS_PROGRAMS,
    instagram: "sowuts",
  },
  {
    name: "Macquarie University",
    short: "Wednesdays 5-7pm, Trinity Chapel.",
    about:
      "SOW at Macquarie University gathers students on the Macquarie Park campus to love Jesus and reach fellow students with the gospel.\n\n" +
      "Come along to our weekly meeting, and join a small group to go deeper through the week.",
    meetingLabel: "Weekly Meeting",
    meeting: "Wednesdays · 5-7pm\nTrinity Chapel, Macquarie Park",
    programs: CAMPUS_PROGRAMS,
    instagram: "sowmq",
  },
  {
    name: "Western Sydney University",
    short: "Seasons Thursdays 6pm, Parramatta South.",
    about:
      "SOW WSU is the newest campus addition to SOW’s ministry, reaching students across Western Sydney with the gospel.\n\n" +
      "WSU hosts Seasons, our biblical training program, every Thursday at 6pm on the Parramatta South Campus.",
    meetingLabel: "Seasons",
    meeting: `Thursdays · 6pm\nParramatta South Campus\n\n${SEASONS_LINE}`,
    programs: [],
    instagram: "sowwsu",
  },
];

const card = (
  title: string,
  body: string,
  extra: Partial<Extract<HomeBlock, { type: "card" }>> = {}
): HomeBlock => ({ type: "card", title, body, buttons: [], ...extra });

const link = (name: string, url: string): HomeLink => ({ name, url });

const phone = (name: string, number: string): HomeLink => ({
  name,
  url: `tel:${number.replace(/\s/g, "")}`,
  note: number,
});

export const DEFAULT_HOME_BLOCKS: Record<HomeTabKey, HomeBlock[]> = {
  home: [
    {
      type: "hero",
      eyebrow: "Student Outreach to the World",
      text:
        "Student Outreach to the World (SOW) is a Christian university ministry " +
        "focused on discipling university students to love Jesus, serve His Church " +
        "and reach His world.",
    },
    { type: "heading", text: "Our values" },
    card("Gospel", "The truth of the gospel informs and drives all our activities.", { dot: true }),
    card("Significance", "The truth of the gospel must reach further with deeper impact.", { dot: true }),
    card("Excellence", "The truth of the gospel must be presented with winsome clarity.", { dot: true }),
    card("Diversity", "The truth of the gospel must reach people of all nations.", { dot: true }),
    { type: "heading", text: "Our story" },
    card(
      "",
      "SOW began in 2007 with a vision rally in Sydney’s inner-west, followed by " +
        "a prayer meeting on the lawns of the University of Sydney. From there it " +
        "grew into a university ministry reaching students across Sydney’s campuses.\n\n" +
        "Each year, students and staff from across the campuses gather for SOW Camp, " +
        "our annual training and discipleship conference (Imago Dei).",
      { buttons: [{ label: "Read our story", url: LINKS.story, style: "ghost" }] }
    ),
    { type: "heading", text: "Get involved" },
    card(
      "Volunteer with SOW",
      "From organising events to design and media, there are plenty of ways " +
        "to serve. Express your interest and we'll find the right fit.",
      {
        buttons: [
          { label: "Learn more", url: LINKS.volunteer, style: "tonal" },
          { label: "Email us", url: `mailto:${CONTACT_EMAIL}`, style: "ghost" },
        ],
      }
    ),
    { type: "heading", text: "Follow along" },
    {
      type: "socials",
      caption: `@studentoutreachtotheworld · ${CONTACT_EMAIL}`,
      links: [
        { label: "Instagram", icon: "logo-instagram", url: "https://www.instagram.com/studentoutreachtotheworld/" },
        { label: "Facebook", icon: "logo-facebook", url: "https://www.facebook.com/studentoutreachtotheworld/" },
        { label: "LinkedIn", icon: "logo-linkedin", url: "https://www.linkedin.com/company/student-outreach-to-the-world/" },
        { label: "Spotify", icon: "musical-notes", url: "https://open.spotify.com/user/1269730164/playlist/3rTOUyg7Of4WGZRQy1xZN9" },
        { label: "sow.org.au", icon: "globe-outline", url: "https://www.sow.org.au" },
        { label: "Email", icon: "mail-outline", url: `mailto:${CONTACT_EMAIL}` },
      ],
    },
  ],
  resources: [
    {
      type: "text",
      text:
        "Websites, counsellors and helplines we often point people to, the " +
        "same list THE SHED uses on the web.",
    },
    { type: "heading", text: "Websites" },
    {
      type: "links",
      links: [
        link("Ligonier", "https://www.ligonier.org/"),
        link("Christ College", "https://christcollege.edu.au/"),
        link("Monergism", "https://www.monergism.com/"),
        link("Reformed Theological Seminary", "https://rts.edu/"),
        link("Covenant Seminary", "https://www.covenantseminary.edu/"),
        link("ACL - Faith and Politics", "https://www.acl.org.au/"),
        link("BioLogos - Faith and Science", "https://biologos.org/"),
        link("truthxchange - Faith and Society", "https://truthxchange.com/"),
      ],
    },
    { type: "heading", text: "Christian psychologists" },
    {
      type: "links",
      links: [
        link("Dr. Robyn Milligan", "https://milliganhealth.com.au/robynmilligan/"),
        link("Ray of Hope Clinic", "https://www.rayofhope.com.au/"),
        link("The Resilience Centre", "https://www.theresiliencecentre.com.au/"),
        link("Dr Linda Nguy", "http://www.delhiroadclinic.com.au/clinicians/dr-linda-nguy/"),
        link("Effective Living", "https://www.effectiveliving.com.au/"),
        link("The Talbot Centre", "https://thetalbotcentre.com.au/"),
      ],
    },
    { type: "heading", text: "Helplines" },
    {
      type: "links",
      links: [
        phone("Mental Health Helpline", "1800 011 511"),
        phone("Lifeline", "13 11 14"),
        phone("Kids Helpline", "1800 55 1800"),
        phone("Drug and Alcohol Support", "02 9977 0711"),
        phone("Domestic Violence Support", "1800 65 64 63"),
        phone("Child Protection Helpline", "13 21 11"),
      ],
    },
  ],
  connect: [
    {
      type: "text",
      text: "Find your campus below to see where and when SOW gathers each week.",
    },
    { type: "campuses", campuses: DEFAULT_CAMPUSES },
    { type: "heading", text: "Weekly Meeting" },
    card(
      "",
      "Each campus holds a Weekly Meeting where we come together to learn and " +
        "discuss from God’s word and have fellowship with one another. Throughout " +
        "the week, we also hold small groups and do life together!"
    ),
    { type: "heading", text: "REAP" },
    card(
      "",
      "Reading, Encouragement, Accountability and Prayer. Bible study and accountability in small groups, with each campus working through its own material."
    ),
    { type: "heading", text: "Seasons" },
    card("Western Sydney University", SEASONS_LINE, { campus: "Western Sydney University" }),
    { type: "heading", text: "Key events" },
    card(
      "SOW Camp",
      "Our annual training and discipleship conference, Imago Dei, at Kiah Ridge Christian Conference Centre."
    ),
    card(
      "New to a campus?",
      `Message your campus on Instagram from its card above, or email ${CONTACT_EMAIL} ` +
        "and we'll help you find your first Weekly Meeting.",
      {
        buttons: [
          { label: "Email us", url: `mailto:${CONTACT_EMAIL}`, style: "tonal", icon: "mail-outline" },
          { label: "sow.org.au/students", url: LINKS.students, style: "ghost" },
        ],
      }
    ),
  ],
  partner: [
    {
      type: "text",
      text:
        "SOW is a ministry carried by its partners. Here are the ways you can " +
        "stand with us.",
    },
    card(
      "Pray",
      "Partner with us in prayer. Our monthly newsletters share what's " +
        "happening across our campuses and how to pray for it.",
      { icon: "heart-outline", buttons: [{ label: "Prayer updates", url: LINKS.pray, style: "tonal" }] }
    ),
    card(
      "Give",
      "SOW is sustained by generous supporters. One-off or weekly gifts both " +
        "go a long way in reaching students.",
      { icon: "gift-outline", buttons: [{ label: "Donate", url: LINKS.donate, style: "tonal" }] }
    ),
    card(
      "Volunteer",
      "Lend your time and skills, from events to design and media. Tell us " +
        "how you'd love to serve.",
      { icon: "hand-left-outline", buttons: [{ label: "Volunteer", url: LINKS.volunteer, style: "tonal" }] }
    ),
    card(
      "Subscribe to our newsletter",
      "Monthly news and updates from across our campuses, straight to your inbox.",
      { tone: "primary", buttons: [{ label: "Sign up", url: LINKS.newsletterSignup, style: "ghost" }] }
    ),
    {
      type: "contact",
      title: "Contact us",
      body:
        "Questions, prayer requests, or just want to say hi? Send us a message " +
        "and we'll get back to you.",
    },
  ],
};

/** A fresh block of a type, for the editor's "Add section". */
export const emptyHomeBlock = (type: HomeBlockType): HomeBlock => {
  switch (type) {
    case "hero":
      return { type, eyebrow: "", text: "" };
    case "heading":
    case "text":
      return { type, text: "" };
    case "card":
      return { type, title: "", body: "", buttons: [] };
    case "links":
      return { type, links: [{ name: "", url: "" }] };
    case "socials":
      return { type, caption: "", links: [{ label: "", icon: "globe-outline", url: "" }] };
    case "campuses":
      return {
        type,
        campuses: [
          { name: "", short: "", about: "", meetingLabel: "Weekly Meeting", meeting: "", programs: [], instagram: "" },
        ],
      };
    case "contact":
      return { type, title: "Contact us", body: "" };
  }
};

/**
 * Admins, anyone in the Marketing department and the head of the Engagement
 * division may edit the Home tab. Other Engagement staff (e.g. Alumni) may not.
 */
export const canEditHomeProfile = (
  profile: ProfileLike,
  isAdmin: boolean,
  headedDivisions: readonly string[]
): boolean =>
  isAdmin ||
  departmentsOf(profile).includes(MARKETING_DEPARTMENT) ||
  headedDivisions.includes(ENGAGEMENT_DIVISION);

export const MAX_HOME_BLOCKS = 60;
export const MAX_HOME_ITEMS = 40;
const MAX_TEXT = 4000;
const SAFE_URL = /^(https?:\/\/|mailto:|tel:)\S+$/i;

/** A link people can tap: web, email or phone. Bare domains get https://. */
export const normalizeHomeUrl = (raw: string): string | null => {
  const url = raw.trim();
  if (!url) return null;
  if (SAFE_URL.test(url)) return url;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(url)) return `https://${url}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`;
  return null;
};

export class HomeContentError extends Error {}

const clean = (text: string, field: string): string => {
  const out = text.replace(/\r\n/g, "\n").trim();
  if (out.length > MAX_TEXT) {
    throw new HomeContentError(`${field} is too long (${MAX_TEXT} characters max).`);
  }
  return out;
};

const required = (text: string, field: string): string => {
  const out = clean(text, field);
  if (!out) throw new HomeContentError(`${field} can't be empty.`);
  return out;
};

const url = (raw: string, field: string): string => {
  const out = normalizeHomeUrl(raw);
  if (!out) {
    throw new HomeContentError(
      `${field} needs a web address, email or phone link (got “${raw.trim() || "nothing"}”).`
    );
  }
  return out;
};

const items = <T>(list: T[], field: string): T[] => {
  if (list.length > MAX_HOME_ITEMS) {
    throw new HomeContentError(`${field} has too many items (${MAX_HOME_ITEMS} max).`);
  }
  return list;
};

const optional = (text: string | undefined): string | undefined => {
  const out = text?.trim();
  return out ? out : undefined;
};

/**
 * Trims every field, checks links and drops empty rows, so whatever the editor
 * sends is safe to draw. Throws HomeContentError with a message for the editor.
 */
export const sanitizeHomeBlocks = (blocks: HomeBlock[]): HomeBlock[] => {
  if (blocks.length > MAX_HOME_BLOCKS) {
    throw new HomeContentError(`A tab can have at most ${MAX_HOME_BLOCKS} sections.`);
  }
  return blocks.map((block, i): HomeBlock => {
    const where = `Section ${i + 1} (${HOME_BLOCK_LABELS[block.type]})`;
    switch (block.type) {
      case "hero":
        return { type: "hero", eyebrow: clean(block.eyebrow, where), text: required(block.text, where) };
      case "heading":
      case "text":
        return { type: block.type, text: required(block.text, where) };
      case "card": {
        const title = clean(block.title, `${where} title`);
        const body = clean(block.body, `${where} text`);
        if (!title && !body) throw new HomeContentError(`${where} needs a title or text.`);
        const buttons = items(block.buttons, `${where} buttons`)
          .filter((b) => b.label.trim() || b.url.trim())
          .map((b) => ({
            label: required(b.label, `${where} button label`),
            url: url(b.url, `${where} button “${b.label.trim()}”`),
            style: b.style,
            ...(optional(b.icon) ? { icon: optional(b.icon) } : {}),
          }));
        return {
          type: "card",
          title,
          body,
          ...(optional(block.icon) ? { icon: optional(block.icon) } : {}),
          ...(block.dot ? { dot: true } : {}),
          ...(optional(block.campus) ? { campus: optional(block.campus) } : {}),
          ...(block.tone === "primary" ? { tone: "primary" as const } : {}),
          buttons,
        };
      }
      case "links":
        return {
          type: "links",
          links: items(block.links, where)
            .filter((l) => l.name.trim() || l.url.trim())
            .map((l) => ({
              name: required(l.name, `${where} link name`),
              url: url(l.url, `${where} “${l.name.trim()}”`),
              ...(optional(l.note) ? { note: optional(l.note) } : {}),
            })),
        };
      case "socials":
        return {
          type: "socials",
          caption: clean(block.caption, where),
          links: items(block.links, where)
            .filter((l) => l.label.trim() || l.url.trim())
            .map((l) => ({
              label: required(l.label, `${where} label`),
              icon: required(l.icon, `${where} icon`),
              url: url(l.url, `${where} “${l.label.trim()}”`),
            })),
        };
      case "campuses":
        return {
          type: "campuses",
          campuses: items(block.campuses, where)
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: required(c.name, `${where} campus name`),
              short: clean(c.short, `${where} summary`),
              about: clean(c.about, `${where} about`),
              meetingLabel: clean(c.meetingLabel, `${where} meeting label`) || "Weekly Meeting",
              meeting: clean(c.meeting, `${where} meeting`),
              programs: items(c.programs, `${where} programs`)
                .map((p) => p.trim())
                .filter(Boolean),
              instagram: clean(c.instagram, `${where} Instagram`).replace(/^@/, ""),
            })),
        };
      case "contact":
        return { type: "contact", title: required(block.title, where), body: clean(block.body, where) };
    }
  });
};

/** Splits text on blank lines into paragraphs. */
export const paragraphs = (text: string): string[] =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
