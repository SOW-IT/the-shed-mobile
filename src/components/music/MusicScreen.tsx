import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import {
  ConfirmDialog,
  errorMessage,
  FooterAction,
  Toast,
  type ToastState,
} from "@/components/ui";
import { showNotice } from "@/lib/notice";
import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
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
  // Both follow the role an admin is acting as (directory.me).
  const canReview = me?.isPraiseManager === true;
  const canManageRequests = me?.canManagePraiseList === true;
  const requestedTab =
    tab === "review" && canReview
      ? "toReview"
      : tab === "my-requests" && me?.canManagePraiseList === false
        ? "myRequest"
        : "approvedPlaylist";

  // Request sheet state
  const [requestPrefill, setRequestPrefill] = useState<MusicRequest | null>(
    null,
  );

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const removeRequest = useMutation(api.musicRequests.remove);
  const [hideRequestComment, setHideRequestComment] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingDelete, setPendingDelete] = useState<MusicRequest | null>(null);

  const handleEdit = (
    request: MusicRequest,
    source: "approved" | "myRequests" | "toReview",
  ) => {
    setRequestPrefill(request);
    setHideRequestComment(source !== "myRequests");
    setNewRequestOpen(true);
  };

  const handleDelete = (request: MusicRequest) => setPendingDelete(request);

  const deleteRequest = async (request: MusicRequest) => {
    try {
      await removeRequest({ requestId: request._id });
      setToast({
        text:
          request.status === "APPROVED"
            ? "Removed from the playlist"
            : "Request deleted",
      });
    } catch (error) {
      showNotice("Couldn't delete", errorMessage(error));
    }
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
            canManageRequests
              ? (request) => handleEdit(request, "approved")
              : undefined
          }
          onDeleteRequest={canManageRequests ? handleDelete : undefined}
        />
      ),
    },
    // Anyone without the review buttons sees their own requests.
    ...(!canManageRequests
      ? [
          {
            key: "myRequest",
            label: "Mine",
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
            label: "To review",
            render: () => (
              <ToReviewTab
                canManageRequests={canManageRequests}
                onEditRequest={
                  canManageRequests
                    ? (request) => handleEdit(request, "toReview")
                    : undefined
                }
                onDeleteRequest={canManageRequests ? handleDelete : undefined}
              />
            ),
          },
        ]
      : []),
  ];
  // A tab can disappear when the acting-as role changes.
  const preferredTab = selectedTab ?? requestedTab;
  const active = tabs.some((item) => item.key === preferredTab)
    ? preferredTab
    : "approvedPlaylist";

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setSelectedTab}
        floating={<Toast toast={toast} />}
        floatingAboveFooter
        footer={
          showMakeRequest ? (
            <FooterAction
              title={canManageRequests ? "+ Add to Playlist" : "+ Make Request"}
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
        addsDirectly={canManageRequests}
        onSaved={(text) => setToast({ text })}
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        title={
          pendingDelete?.status === "APPROVED"
            ? "Remove from the playlist?"
            : "Delete request?"
        }
        message={
          pendingDelete
            ? `${pendingDelete.title} by ${pendingDelete.artist}`
            : undefined
        }
        confirmLabel={
          pendingDelete?.status === "APPROVED" ? "Remove" : "Delete"
        }
        onConfirm={() => {
          if (pendingDelete) void deleteRequest(pendingDelete);
        }}
        onClose={() => setPendingDelete(null)}
      />

      <MusicGuideSheet
        visible={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </>
  );
}
