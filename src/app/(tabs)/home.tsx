import { useState } from "react";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  CampusesTab,
  HomeMissionTab,
  PartnerTab,
  ResourcesTab,
} from "@/components/home/HomeTabs";

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
