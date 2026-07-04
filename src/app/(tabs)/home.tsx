import { useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { api } from "../../../convex/_generated/api";
import { LoadingState } from "@/components/ui";
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
 *
 * Home is a visitor-only surface — the tab drops off the bar once signed in
 * (see the tabs layout). A signed-in user who still lands here (e.g. right after
 * signing in from this very tab, before the bar updates) is forwarded to their
 * normal landing surface so they don't get stranded on a now-hidden tab.
 */
export default function HomeScreen() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.directory.me, isAuthenticated ? {} : "skip");
  const [active, setActive] = useState("home");

  if (isAuthenticated) {
    if (me === undefined) return <LoadingState />;
    const target = !me?.profile
      ? "/org"
      : me.isCampusLeader
        ? "/attendance"
        : "/";
    return <Redirect href={target} />;
  }

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
