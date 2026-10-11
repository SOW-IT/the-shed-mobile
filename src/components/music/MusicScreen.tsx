import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { FooterAction } from "@/components/ui";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useState } from "react";
import { ApprovedPlaylistTab, MyRequestsTab, ToReviewTab } from "./MusicTabs";
import {
  MusicGuideSheet,
  type MusicRequest,
  NewMusicRequestSheet,
} from "./MyMusicRequests";

export default function MusicScreen() {
  const me = useQuery(api.directory.me);

  // Current Music tab
  const [active, setActive] = useState("approvedPlaylist");

  // Request sheet state
  const [requestPrefill, setRequestPrefill] = useState<MusicRequest | null>(
    null,
  );

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Open a blank music request form
  const openNewRequest = () => {
    setRequestPrefill(null);
    setNewRequestOpen(true);
  };

  // Staff can make requests
  const showMakeRequest = me?.profile != null;

  // Only Chaplains can review requests
  // const canReview = me?.isChaplain === true; TODO
  const canReview = true;

  // Music navigation tabs
  const tabs: PagerTab[] = [
    {
      key: "approvedPlaylist",
      label: "Approved Playlist",
      render: () => <ApprovedPlaylistTab />,
    },
    {
      key: "myRequest",
      label: "My Request",
      render: () => <MyRequestsTab />,
    },
    ...(canReview
      ? [
          {
            key: "toReview",
            label: "To Review",
            render: () => <ToReviewTab />,
          },
        ]
      : []),
  ];

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setActive}
        footer={
          showMakeRequest ? (
            <FooterAction
              title="+ Make Request"
              onPress={openNewRequest}
              onInfo={() => setGuideOpen(true)}
            />
          ) : undefined
        }
      />

      <NewMusicRequestSheet
        visible={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        prefill={requestPrefill}
      />

      <MusicGuideSheet
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
}
