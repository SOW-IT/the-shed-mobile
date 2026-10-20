import { useMutation } from "convex/react";
import { usePathname } from "expo-router";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { setCurrentRoute, setErrorReporter } from "@/lib/errorReporting";

export function ErrorReporter() {
  const report = useMutation(api.appErrors.report);
  const pathname = usePathname();
  useEffect(() => {
    setCurrentRoute(pathname);
  }, [pathname]);
  useEffect(() => {
    setErrorReporter((error) => report(error));
    return () => setErrorReporter(null);
  }, [report]);
  return null;
}
