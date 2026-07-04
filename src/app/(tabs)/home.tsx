import { useState } from "react";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  CampusesTab,
  HomeMissionTab,
  PartnerTab,
  ResourcesTab,
} from "@/components/home/HomeTabs";

/**
 * The public Home tab (1.7.0): who SOW is and how to get involved, open to
 * everyone before signing in. Four swipeable pages: the mission and socials,
 * helpful resources (mirroring THE SHED web footer), Connect (the campuses and
 * their weekly meetings), and ways to partner (pray / give / volunteer +
 * newsletter).
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
