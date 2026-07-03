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

export const CONTACT_EMAIL = "info@sowaustralia.com";

export const LINKS = {
  website: "https://www.sow.org.au",
  mission: "https://www.sow.org.au/our-mission",
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

/** Helpful websites — mirrors THE SHED web app footer. */
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
  { name: "Drug and Alcohol Support", phoneNumber: "9977 0711" },
  { name: "Domestic Violence Support", phoneNumber: "1800 65 64 63" },
  { name: "Child Protection Helpline", phoneNumber: "13 21 11" },
];

/**
 * The campuses with a SOW society (sow.org.au/students). Full names match the
 * org's university records so `universityColour` resolves each brand colour.
 */
export const CAMPUSES: { name: string; blurb: string }[] = [
  {
    name: "University of Sydney",
    blurb: "Weekly meeting and small groups on the Camperdown campus.",
  },
  {
    name: "University of New South Wales",
    blurb: "Weekly meeting and small groups on the Kensington campus.",
  },
  {
    name: "University of Technology, Sydney",
    blurb: "Weekly meeting and small groups around the Broadway campus.",
  },
  {
    name: "Macquarie University",
    blurb: "Weekly meeting and small groups on the Wallumattagal campus.",
  },
  {
    name: "Australian Catholic University",
    blurb: "Weekly meeting and small groups on the North Sydney campus.",
  },
];

export const CAMPUS_MEETING_NOTE =
  "Each campus holds a Weekly Meeting where we come together to learn and " +
  "discuss from God's word and have fellowship with one another. Throughout " +
  "the week, we also hold small groups and do life together!";
