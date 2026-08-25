import { Redirect } from "expo-router";

export default function ReviewRedirect() {
  return <Redirect href={{ pathname: "/", params: { tab: "review" } }} />;
}
