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
          ? `Receipt files for the ${year} staff year will be deleted on 1 October ${currentYear}, when the staff year rolls over. Download anything you need to keep.`
          : `Receipt files for the ${year} staff year have already been deleted and can no longer be opened. Only the file names remain for reference.`
      }
    />
  );
};
