type OfflinePage<P extends { id: string }> = { people: P[]; more: boolean; next?: string };

export const joinPages = <P extends { id: string }>(pages: readonly (OfflinePage<P> | undefined)[]) => {
  const loaded: OfflinePage<P>[] = [];
  for (const page of pages) {
    if (page === undefined) break;
    loaded.push(page);
  }
  if (loaded.length === 0) return undefined;
  const seen = new Set<string>();
  const people: P[] = [];
  for (const page of loaded) {
    for (const person of page.people) {
      if (seen.has(person.id)) continue;
      seen.add(person.id);
      people.push(person);
    }
  }
  const last = loaded[loaded.length - 1];
  const loading = loaded.length < pages.length;
  return { people, loading, next: !loading && last.more ? last.next : undefined };
};
