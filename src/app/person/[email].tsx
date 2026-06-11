import { useLocalSearchParams } from "expo-router";
import { ProfileView } from "@/components/ProfileView";

export default function PersonScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  return <ProfileView email={decodeURIComponent(email ?? "")} />;
}
