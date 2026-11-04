import { useState } from "react";
import { eventStaffYear } from "../../shared/flow";
import { WarningBanner } from "@/components/ui";

export const ReceiptFilesNote = ({ years }: { years: number[] }) => {
  const [currentYear] = useState(() => eventStaffYear(Date.now()));
  const lastYear = currentYear - 1;
  const notes = [
    years.includes(lastYear)
      ? `Receipt files for the ${lastYear} staff year are deleted on 1 October ${currentYear}. Download anything you need.`
      : null,
    years.some((year) => year < lastYear)
      ? `Receipt files from before the ${lastYear} staff year have been deleted. Only the file names remain.`
      : null,
  ].filter((note): note is string => note !== null);
  return (
    <>
      {notes.map((note) => (
        <WarningBanner key={note} message={note} />
      ))}
    </>
  );
};
