import { ChromeScreen } from "@/components/ChromeScreen";
import { PagerScreen, type PagerTab } from "@/components/PagerScreen";
import { SignInPrompt } from "@/components/SignInPrompt";
import {
  Card,
  ConfirmDialog,
  errorMessage,
  FooterAction,
  LoadingState,
  Muted,
  Screen,
  Toast,
  type ToastState,
  Txt,
} from "@/components/ui";
import { typography } from "@/theme";
import { api } from "@convex/_generated/api";
import { staffOnlyMessage } from "@shared/staffOnly";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { ApprovedPlaylistTab, MyRequestsTab, ToReviewTab } from "./MusicTabs";
import {
  MusicGuideSheet,
  type MusicRequest,
  NewMusicRequestSheet,
} from "./MyMusicRequests";
import { PraiseManagersTab } from "./PraiseManagersCard";

export default function MusicScreen() {
  const convex = useConvex();
  const me = useQuery(api.directory.me);
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [selectedTab, setSelectedTab] = useState<string | null>(null);
  // Both follow the role an admin is acting as (directory.me).
  const canReview = me?.isPraiseManager === true;
  const canManageRequests = me?.canManagePraiseList === true;
  const addsDirectly = me?.songsSkipReview === true;
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
  const [requestAgain, setRequestAgain] = useState<MusicRequest | null>(null);

  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const removeRequest = useMutation(api.musicRequests.remove);
  const [hideRequestComment, setHideRequestComment] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingDelete, setPendingDelete] = useState<MusicRequest | null>(null);

  const latestRequestAgainCheck = useRef(0);

  const handleEdit = (
    request: MusicRequest,
    source: "approved" | "myRequests" | "toReview",
  ) => {
    latestRequestAgainCheck.current++;
    setRequestPrefill(request);
    setRequestAgain(null);
    setHideRequestComment(source !== "myRequests");
    setNewRequestOpen(true);
  };

  const handleRequestAgain = async (request: MusicRequest) => {
    const check = ++latestRequestAgainCheck.current;
    const open = await convex
      .query(api.musicRequests.checkDuplicate, {
        link: request.link,
        title: request.title,
        artist: request.artist,
        isrc: request.isrc,
        excludeId: request._id,
      })
      .catch(() => null);
    if (check !== latestRequestAgainCheck.current) return;
    if (open?.kind === "exact") {
      setToast({
        text: `This recording was already requested (${open.status.toLowerCase()}).`,
      });
      return;
    }
    setRequestPrefill(null);
    setRequestAgain(request);
    setHideRequestComment(false);
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
      setToast({ text: `Couldn't delete: ${errorMessage(error)}` });
    }
  };

  // Open a blank music request form
  const openNewRequest = () => {
    latestRequestAgainCheck.current++;
    setRequestPrefill(null);
    setRequestAgain(null);
    setHideRequestComment(false);
    setNewRequestOpen(true);
  };

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
                onRequestAgain={(request) => void handleRequestAgain(request)}
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
    ...(me?.isAdmin
      ? [
          {
            key: "praiseManagers",
            label: "Praise Managers",
            render: () => <PraiseManagersTab currentYear={me.year} />,
          },
        ]
      : []),
  ];
  // A tab can disappear when the acting-as role changes.
  const preferredTab = selectedTab ?? requestedTab;
  const active = tabs.some((item) => item.key === preferredTab)
    ? preferredTab
    : "approvedPlaylist";

  if (me === undefined) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (me === null) {
    return (
      <ChromeScreen>
        <SignInPrompt what="page" />
      </ChromeScreen>
    );
  }
  if (me.profile === null) {
    return (
      <ChromeScreen>
        <Card>
          <Txt style={typography.section}>Praise List</Txt>
          <Muted>{staffOnlyMessage("Praise List", me)}</Muted>
        </Card>
      </ChromeScreen>
    );
  }

  return (
    <>
      <PagerScreen
        tabs={tabs}
        activeKey={active}
        onActiveKeyChange={setSelectedTab}
        floating={<Toast toast={toast} />}
        floatingAboveFooter
        footer={
          <FooterAction
            title={addsDirectly ? "+ Add to Playlist" : "+ Make Request"}
            onPress={openNewRequest}
            onInfo={() => setGuideOpen(true)}
          />
        }
      />

      <NewMusicRequestSheet
        visible={newRequestOpen}
        onClose={() => setNewRequestOpen(false)}
        prefill={requestPrefill}
        again={requestAgain}
        hideRequestComment={hideRequestComment}
        addsDirectly={addsDirectly}
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
