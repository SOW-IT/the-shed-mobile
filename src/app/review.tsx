import { Redirect } from "expo-router";

/**
 * To Review now lives inside the Requests tab. This route only survives so
 * push notifications that deep-link to /review keep working.
 */
export default function ReviewRedirect() {
  return <Redirect href={{ pathname: "/", params: { tab: "review" } }} />;
}
