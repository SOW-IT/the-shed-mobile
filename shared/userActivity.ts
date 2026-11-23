export const ACTIVITY_EMAIL_LIMIT = 600;

export const activityBatches = (emails: readonly string[]): string[][] => {
  const batches: string[][] = [];
  for (let i = 0; i < emails.length; i += ACTIVITY_EMAIL_LIMIT) batches.push(emails.slice(i, i + ACTIVITY_EMAIL_LIMIT));
  return batches;
};
