import { useConvex } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { EARLIEST_REQUEST_YEAR } from "../../shared/flow";
import { buildRequestsCsv, downloadCsv } from "@/lib/requestsCsv";
import {
  Btn,
  Card,
  ErrorBanner,
  errorMessage,
  MultiSelect,
  Muted,
  SectionTitle,
} from "@/components/ui";

/** Staff years from the current year back to 2021, newest-first. */
const yearsFrom = (currentYear: number): number[] => {
  const years: number[] = [];
  for (let y = currentYear; y >= EARLIEST_REQUEST_YEAR; y--) years.push(y);
  return years;
};

/**
 * Finance-only control (All tab) to export every request for the chosen staff
 * years to a CSV. All years are selected by default; the user can uncheck any.
 */
export const ExportRequestsCard = ({ currentYear }: { currentYear: number }) => {
  const convex = useConvex();
  const years = yearsFrom(currentYear);
  const [selected, setSelected] = useState<string[]>(years.map(String));
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setDownloading(true);
    setError(null);
    try {
      const chosen = selected.map(Number).sort((a, b) => a - b);
      const rows = await convex.query(api.requests.requestsForExport, {
        years: chosen,
      });
      const span =
        chosen.length > 0
          ? chosen[0] === chosen[chosen.length - 1]
            ? `${chosen[0]}`
            : `${chosen[0]}-${chosen[chosen.length - 1]}`
          : "none";
      await downloadCsv(`shed-requests-${span}.csv`, buildRequestsCsv(rows ?? []));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <SectionTitle>Export</SectionTitle>
      <Card>
        <Muted>Download all requests for the selected staff years as a CSV.</Muted>
        <MultiSelect
          label="Years"
          values={selected}
          options={years.map((y) => ({ label: String(y), value: String(y) }))}
          onSelect={setSelected}
          placeholder="Choose staff years…"
        />
        <ErrorBanner message={error} />
        <Btn
          title="Download CSV"
          loading={downloading}
          disabled={selected.length === 0}
          onPress={() => void download()}
        />
      </Card>
    </>
  );
};
