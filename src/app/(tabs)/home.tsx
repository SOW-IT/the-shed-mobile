import { useState } from "react";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  CampusesTab,
  HomeMissionTab,
  PartnerTab,
  ResourcesTab,
} from "@/components/home/HomeTabs";

/**
 * The public Home tab: who SOW is and how to get involved. Four swipeable
 * pages: the mission and socials, helpful resources (mirroring THE SHED web
 * footer), Connect (the campuses and their weekly meetings), and ways to
 * partner (pray / give / volunteer + newsletter).
 *
 * Home is the leftmost tab for everyone (1.7.4) — visitors and signed-in users
 * alike — so anyone can come back to the SOW landing surface. It no longer
 * redirects signed-in users away: signing in keeps you where you are, and the
 * top-left logo takes staff to their workspace but visitors and signed-in
 * non-staff here.
 */
export default function HomeScreen() {
  const [active, setActive] = useState("home");

  const tabs: PagerTab[] = [
    { key: "home", label: "Home", render: () => <HomeMissionTab /> },
    { key: "resources", label: "Resources", render: () => <ResourcesTab /> },
    { key: "campuses", label: "Connect", render: () => <CampusesTab /> },
    { key: "partner", label: "Partner", render: () => <PartnerTab /> },
  ];

  return (
    <PagerScreen tabs={tabs} activeKey={active} onActiveKeyChange={setActive} />
  );
}
