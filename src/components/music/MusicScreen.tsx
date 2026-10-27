import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { FooterAction } from "@/components/ui";
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Platform } from "react-native";
import { ApprovedPlaylistTab, MyRequestsTab, ToReviewTab } from "./MusicTabs";
import {
  MusicGuideSheet,
  type MusicRequest,
  NewMusicRequestSheet,
} from "./MyMusicRequests";

export default function MusicScreen() {
  const me = useQuery(api.directory.me);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  const canReview = me?.isPraiseManager === true;
  const requestedTab =
    tab === "review" && canReview
      ? "toReview"
      : tab === "my-requests" && me?.isPraiseManager === false
        ? "myRequest"
        : "approvedPlaylist";

  const active = selectedTab ?? requestedTab;

  // Request sheet state
  const [requestPrefill, setRequestPrefill] = useState<MusicRequest | null>(
    null,
  );

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const removeRequest = useMutation(api.musicRequests.remove);
  const [hideRequestComment, setHideRequestComment] = useState(false);

  const handleEdit = (
    request: MusicRequest,
    source: "approved" | "myRequests" | "toReview",
  ) => {
    setRequestPrefill(request);
    setHideRequestComment(source !== "myRequests");
    setNewRequestOpen(true);
  };

  const handleDelete = (request: MusicRequest) => {
    const deleteRequest = async () => {
      try {
        await removeRequest({ requestId: request._id });
      } catch (error) {
        Alert.alert(
          "Couldn't delete request",
          error instanceof Error ? error.message : "Please try again.",
        );
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${request.title}"?`)) {
        void deleteRequest();
      }
      return;
    }

    Alert.alert("Delete request?", request.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void deleteRequest(),
      },
    ]);
  };

  // Open a blank music request form
  const openNewRequest = () => {
    setRequestPrefill(null);
    setHideRequestComment(false);
    setNewRequestOpen(true);
  };

  const showMakeRequest = me?.profile != null;

  // Music navigation tabs
  const tabs: PagerTab[] = [
    {
      key: "approvedPlaylist",
      label: "Approved Playlist",
      selfScrolling: true,
      render: () => (
        <ApprovedPlaylistTab
          onEditRequest={
            canReview ? (request) => handleEdit(request, "approved") : undefined
          }
          onDeleteRequest={canReview ? handleDelete : undefined}
        />
      ),
    },
    ...(!canReview
      ? [
          {
            key: "myRequest",
            label: "My Request",
            render: () => (
              <MyRequestsTab
                onEditRequest={(request) => handleEdit(request, "myRequests")}
                onDeleteRequest={handleDelete}
              />
            ),
          },
        ]
      : []),
    ...(canReview
      ? [
          {
            key: "toReview",
            label: "To Review",
            render: () => (
              <ToReviewTab
                onEditRequest={(request) => handleEdit(request, "toReview")}
                onDeleteRequest={handleDelete}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setSelectedTab}
        footer={
          showMakeRequest ? (
            <FooterAction
              title={canReview ? "+ Add to Playlist" : "+ Make Request"}
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
        hideRequestComment={hideRequestComment}
      />

      <MusicGuideSheet
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
}
