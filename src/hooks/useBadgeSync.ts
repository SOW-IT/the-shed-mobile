import { useQuery } from "convex/react";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { Platform } from "react-native";
import { api } from "../../convex/_generated/api";

export const useBadgeSync = (isStaff: boolean) => {
  const unread = useQuery(api.notifications.unreadCount, isStaff ? {} : "skip");
  useEffect(() => {
    if (Platform.OS === "web") return;
    void Notifications.setBadgeCountAsync(isStaff ? (unread ?? 0) : 0).catch(() => {});
  }, [isStaff, unread]);
};
