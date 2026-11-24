import { CalendarView } from "@/components/calendar/CalendarView";
import { backOr } from "@/lib/goBack";
import { useRouter } from "expo-router";

export default function WorldCalendarScreen() {
  const router = useRouter();
  return <CalendarView onBack={() => backOr(router, "/world")} />;
}
