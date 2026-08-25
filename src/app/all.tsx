import { Redirect } from "expo-router";

export default function AllRedirect() {
  return <Redirect href={{ pathname: "/", params: { tab: "all" } }} />;
}
