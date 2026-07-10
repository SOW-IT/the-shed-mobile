/**
 * Static content for the public Home tab, sourced from sow.org.au and the
 * SOW Brand Guidelines (mission, values) plus THE SHED web app's footer
 * (helpful websites, Christian psychologists, helplines). Kept as plain data
 * so copy edits never touch layout code.
 */

export const MISSION_STATEMENT =
  "Student Outreach to the World (SOW) is a Christian university ministry " +
  "focused on discipling university students to love Jesus, serve His Church " +
  "and reach His world.";

/** The four brand values, verbatim from sow.org.au/our-mission. */
export const VALUES: { name: string; line: string }[] = [
  { name: "Gospel", line: "The truth of the gospel informs and drives all our activities." },
  { name: "Significance", line: "The truth of the gospel must reach further with deeper impact." },
  { name: "Excellence", line: "The truth of the gospel must be presented with winsome clarity." },
  { name: "Diversity", line: "The truth of the gospel must reach people of all nations." },
];

/** Story copy drawn from sow.org.au/our-story: evergreen summary. */
export const OUR_STORY: string[] = [
  "SOW began in 2007 with a vision rally in Sydney’s inner-west, followed by " +
    "a prayer meeting on the lawns of the University of Sydney. From there it " +
    "grew into a university ministry reaching students across Sydney’s campuses.",
  "Each year, students and staff from across the campuses gather for SOW Camp, " +
    "our annual training and discipleship conference (Imago Dei).",
];

export const CONTACT_EMAIL = "info@sowaustralia.com";

export const LINKS = {
  website: "https://www.sow.org.au",
  mission: "https://www.sow.org.au/our-mission",
  story: "https://www.sow.org.au/our-story",
  campusMinistry: "https://www.sow.org.au/campus-ministry",
  students: "https://www.sow.org.au/students",
  volunteer: "https://www.sow.org.au/volunteer",
  pray: "https://www.sow.org.au/pray",
  subscriptions: "https://www.sow.org.au/subscriptions",
  newsletterSignup:
    "https://sowaustralia.us1.list-manage.com/subscribe?id=e86a4d965e&u=2213560fe40053caf2afa63b6",
  donate: "https://donorbox.org/sow-support-us?default_interval=w",
  scholarship: "https://donorbox.org/first-year-scholarship",
} as const;

export const SOCIALS: {
  key: string;
  label: string;
  icon: "logo-instagram" | "logo-facebook" | "logo-linkedin" | "musical-notes" | "globe-outline" | "mail-outline";
  url: string;
}[] = [
  {
    key: "instagram",
    label: "Instagram",
    icon: "logo-instagram",
    url: "https://www.instagram.com/studentoutreachtotheworld/",
  },
  {
    key: "facebook",
    label: "Facebook",
    icon: "logo-facebook",
    url: "https://www.facebook.com/studentoutreachtotheworld/",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    icon: "logo-linkedin",
    url: "https://www.linkedin.com/company/student-outreach-to-the-world/",
  },
  {
    key: "spotify",
    label: "Spotify",
    icon: "musical-notes",
    url: "https://open.spotify.com/user/1269730164/playlist/3rTOUyg7Of4WGZRQy1xZN9",
  },
  { key: "website", label: "sow.org.au", icon: "globe-outline", url: "https://www.sow.org.au" },
  { key: "email", label: "Email", icon: "mail-outline", url: `mailto:${CONTACT_EMAIL}` },
];

/** Helpful websites, mirroring THE SHED web app footer. */
export const RESOURCE_WEBSITES: { name: string; link: string }[] = [
  { name: "Ligonier", link: "https://www.ligonier.org/" },
  { name: "Christ College", link: "https://christcollege.edu.au/" },
  { name: "Monergism", link: "https://www.monergism.com/" },
  { name: "Reformed Theological Seminary", link: "https://rts.edu/" },
  { name: "Covenant Seminary", link: "https://www.covenantseminary.edu/" },
  { name: "ACL - Faith and Politics", link: "https://www.acl.org.au/" },
  { name: "BioLogos - Faith and Science", link: "https://biologos.org/" },
  { name: "truthxchange - Faith and Society", link: "https://truthxchange.com/" },
];

export const CHRISTIAN_PSYCHOLOGISTS: { name: string; link: string }[] = [
  { name: "Dr. Robyn Milligan", link: "https://milliganhealth.com.au/robynmilligan/" },
  { name: "Ray of Hope Clinic", link: "https://www.rayofhope.com.au/" },
  { name: "The Resilience Centre", link: "https://www.theresiliencecentre.com.au/" },
  { name: "Dr Linda Nguy", link: "http://www.delhiroadclinic.com.au/clinicians/dr-linda-nguy/" },
  { name: "Effective Living", link: "https://www.effectiveliving.com.au/" },
  { name: "The Talbot Centre", link: "https://thetalbotcentre.com.au/" },
];

export const HELPLINES: { name: string; phoneNumber: string }[] = [
  { name: "Mental Health Helpline", phoneNumber: "1800 011 511" },
  { name: "Lifeline", phoneNumber: "13 11 14" },
  { name: "Kids Helpline", phoneNumber: "1800 55 1800" },
  { name: "Drug and Alcohol Support", phoneNumber: "02 9977 0711" },
  { name: "Domestic Violence Support", phoneNumber: "1800 65 64 63" },
  { name: "Child Protection Helpline", phoneNumber: "13 21 11" },
];

/**
 * Types/content for the Connect section. Weekly meeting day and time are stable
 * per campus (from each campus page on sow.org.au); the exact room can move
 * during the semester, so the location notes when it's announced each term.
 * Update these here whenever a campus changes its slot.
 */
export type WeeklyMeeting = { day: string; time: string; location: string };

export type Campus = {
  /** URL-safe id used by the `/campus/[slug]` detail route. */
  slug: string;
  /** Publicly listed name / university. */
  name: string;
  /** Suburb / campus the society meets on. */
  area: string;
  /** One-line summary for the Connect list card. */
  short: string;
  /** Longer description shown on the campus detail screen. */
  about: string[];
  /** The weekly meeting's day / time / place. Left null until each campus
      confirms its time for the semester. */
  meeting: WeeklyMeeting | null;
  /** The campus's own Instagram handle (without the leading @). */
  instagram: string;
  /** Campus photos for the detail screen gallery. */
  photos: string[];
};

export const CAMPUSES: Campus[] = [
  {
    slug: "usyd",
    name: "University of Sydney",
    area: "Camperdown",
    short: "Tuesdays 5-7pm, Camperdown campus.",
    about: [
      "SOW at the University of Sydney gathers students from across the Camperdown campus to grow together as disciples of Jesus.",
      "Each week we meet to open God’s word together, with optional dinner afterwards, and throughout the week we run small groups and share life as a community.",
    ],
    meeting: {
      day: "Tuesdays",
      time: "5-7pm",
      location: "Camperdown campus (room announced each term)",
    },
    instagram: "sowusyd",
    photos: [],
  },
  {
    slug: "unsw",
    name: "University of New South Wales",
    area: "Kensington",
    short: "Wednesdays 5-7pm, Kensington campus.",
    about: [
      "SOW at UNSW brings together students on the Kensington campus around the gospel, learning from God’s word and encouraging one another.",
      "Our weekly meeting is the heart of the community, with optional dinner afterwards and small groups running through the week.",
    ],
    meeting: {
      day: "Wednesdays",
      time: "5-7pm",
      location: "Kensington campus (room announced each term)",
    },
    instagram: "sowunsw",
    photos: [],
  },
  {
    slug: "uts",
    name: "University of Technology, Sydney",
    area: "Broadway",
    short: "Tuesdays 5-7pm, Broadway campus.",
    about: [
      "SOW at UTS meets around the Broadway campus in the heart of the city, welcoming students to explore and follow Jesus together.",
      "We gather each week, with optional dinner afterwards, and run small groups through the week to grow in faith and friendship.",
    ],
    meeting: {
      day: "Tuesdays",
      time: "5-7pm",
      location: "Broadway campus (room announced each term)",
    },
    instagram: "sowuts",
    photos: [],
  },
  {
    slug: "macq",
    name: "Macquarie University",
    area: "Macquarie Park",
    short: "Wednesdays 5-7pm, Trinity Chapel.",
    about: [
      "SOW at Macquarie University gathers students on the Macquarie Park campus to love Jesus and reach fellow students with the gospel.",
      "Come along to our weekly meeting, and join a small group to go deeper through the week.",
    ],
    meeting: {
      day: "Wednesdays",
      time: "5-7pm",
      location: "Trinity Chapel, Macquarie Park",
    },
    instagram: "sowmq",
    photos: [],
  },
  {
    slug: "wsu",
    name: "Western Sydney University",
    area: "Parramatta South",
    short: "Seasons Thursdays 6pm, Parramatta South.",
    about: [
      "SOW WSU is the newest campus addition to SOW’s ministry, reaching students across Western Sydney with the gospel.",
      "WSU hosts Seasons, our biblical training program, every Thursday at 6pm on the Parramatta South Campus.",
    ],
    meeting: {
      day: "Thursdays",
      time: "6pm",
      location: "Parramatta South Campus",
    },
    instagram: "sowwsu",
    photos: [],
  },
];

export const findCampus = (slug: string): Campus | undefined =>
  CAMPUSES.find((c) => c.slug === slug);

export const CAMPUS_MEETING_NOTE =
  "Each campus holds a Weekly Meeting where we come together to learn and " +
  "discuss from God’s word and have fellowship with one another. Throughout " +
  "the week, we also hold small groups and do life together!";

/** Shared on-campus ministry framing from sow.org.au/campus-ministry. */
export const CAMPUS_INTRO =
  "Campus ministry is at the heart of SOW. Each campus offers these shared " +
  "activities throughout the semester, with exact times set by campus leaders:";

/**
 * On-campus programs each campus runs through the semester, sourced from
 * sow.org.au/campus-ministry. REAP, Seasons and key events aren't tied to a
 * single campus card in the same way (REAP runs everywhere but each campus
 * works through its own material; Seasons is hosted at WSU), so they live in
 * their own entries ({@link REAP}, {@link SEASONS}, {@link KEY_EVENTS}).
 */
export const CAMPUS_PROGRAMS: { name: string; line: string }[] = [
  {
    name: "Weekly Meetings",
    line: "Hear God’s word taught on campus, then discuss in small groups.",
  },
  {
    name: "Road Trips",
    line: "Annual campus road trips and social events for fellowship.",
  },
];

/**
 * REAP runs at every campus, but each works through its own material, so it's
 * its own thing rather than a per-campus program.
 */
export const REAP = {
  name: "REAP",
  line:
    "Reading, Encouragement, Accountability and Prayer. Bible study and accountability in small groups, with each campus working through its own material.",
};

/**
 * Seasons: SOW’s biblical training program at Western Sydney University
 * (Parramatta South). Schedule lives on the WSU campus `meeting` field.
 * Shown on Home → Connect alongside REAP and the campus list.
 */
export const SEASONS = {
  name: "Seasons",
  campus: "Western Sydney University",
  line:
    "SOW’s biblical training program at Western Sydney University. Come " +
    "along to open God’s word with teaching, discussion and practical " +
    "application. Follow @sowwsu for updates.",
};

/**
 * Key events for the whole ministry, across every campus. Just SOW Camp for
 * now; add the rest as they're confirmed each year.
 */
export const KEY_EVENTS: { name: string; line: string }[] = [
  {
    name: "SOW Camp",
    line:
      "Our annual training and discipleship conference, Imago Dei, at Kiah Ridge Christian Conference Centre.",
  },
];
