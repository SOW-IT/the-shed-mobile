import { useState } from "react";
import { eventStaffYear } from "../../shared/flow";
import { WarningBanner } from "@/components/ui";

export const ReceiptFilesNote = ({ year }: { year: number }) => {
  const [currentYear] = useState(() => eventStaffYear(Date.now()));
  if (year >= currentYear) return null;
  return (
    <WarningBanner
      message={
        year === currentYear - 1
          ? `Receipt files for the ${year} staff year are deleted on 1 October ${currentYear}. Download anything you need.`
          : `Receipt files for the ${year} staff year have been deleted. Only the file names remain.`
      }
    />
  );
};
