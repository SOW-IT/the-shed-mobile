/** Names for the invite confirmation: "Ben", "Ben and Chloe", "Ben, Chloe and 2 others". */
export const inviteeList = (names: string[]): string => {
  if (names.length <= 2) return names.join(" and ");
  const others = names.length - 2;
  return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? "other" : "others"}`;
};
