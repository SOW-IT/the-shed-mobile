import { Redirect } from "expo-router";

/** All Requests now lives inside the Requests tab (Finance's All segment). */
export default function AllRedirect() {
  return <Redirect href={{ pathname: "/", params: { tab: "all" } }} />;
}
