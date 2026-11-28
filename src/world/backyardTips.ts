import { ANIMALS, FEEDS, GOODS } from "../../shared/animals";
import { CROPS } from "../../shared/farm";
import { FARMER } from "../../shared/world";

/** The backyard's how-to card: one picture and a line or two for each part of farming. */
export type GuidePart = "plant" | "water" | "grow" | "harvest" | "animals";

const josh = FARMER.name.split(" ")[0];
const days = Object.values(CROPS).map((crop) => crop.days);
const quickest = Math.min(...days);
const slowest = Math.max(...days);
const { chicken, cow } = ANIMALS;

export const GUIDE: readonly { part: GuidePart; title: string; text: string }[] = [
  {
    part: "plant",
    title: "Plant seeds",
    text: `Tap an empty plot and pick a seed. ${josh} in the Garden sells more.`,
  },
  {
    part: "water",
    title: "Water every day so plants don't wilt!",
    text: "A blue drop means a plant is thirsty. Tap it to water. Miss a day and it wilts, and wilted crops sell for less. Three wilts and it dies.",
  },
  {
    part: "grow",
    title: "Watch it grow",
    text: `Each watered day it grows a step, from seed to sprout to full size. Crops take ${quickest} to ${slowest} days.`,
  },
  {
    part: "harvest",
    title: "Harvest",
    text: `When a crop sparkles it's ripe. Tap it to pick it into your bag, then sell it to ${josh} for coins.`,
  },
  {
    part: "animals",
    title: "Care for animals",
    text: `Tap an empty pen to build a coop or barn, then buy animals from ${josh}. Feed ${chicken.label.toLowerCase()}s ${FEEDS[chicken.feed].label.toLowerCase()} and ${cow.label.toLowerCase()}s ${FEEDS[cow.feed].label.toLowerCase()} once a day. Grown ones give ${GOODS[chicken.product].label.toLowerCase()}s or ${GOODS[cow.product].label.toLowerCase()} after they eat; tap to collect. Left hungry three days, they wander off.`,
  },
];
