// Maestro and Playwright find a Field by this id (`id:` on iOS, `data-testid`
// on web). A label can change from required to "(optional)" without breaking
// a flow, so that suffix is left out.
export const fieldTestID = (label: string | undefined) => {
  if (!label) return undefined;
  const slug = label
    .replace(/\(optional\)/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `field-${slug}` : undefined;
};
