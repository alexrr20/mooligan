import * as z from "zod";

const recentSearchesSchema = z.array(z.string().trim().min(1).max(500)).max(8);

export function addRecentSearch(recent: readonly string[], query: string): string[] {
  const value = query.trim().slice(0, 500);
  if (!value) return [...recent];
  return [value, ...recent.filter((entry) => entry.toLowerCase() !== value.toLowerCase())].slice(
    0,
    8,
  );
}

export function readRecentSearches(storage: Pick<Storage, "getItem">, workspaceId: string) {
  try {
    return recentSearchesSchema.parse(
      JSON.parse(storage.getItem(`mooligan.search.recent.${workspaceId}`) ?? "[]"),
    );
  } catch {
    return [];
  }
}

export function writeRecentSearches(
  storage: Pick<Storage, "setItem">,
  workspaceId: string,
  recent: readonly string[],
) {
  try {
    storage.setItem(`mooligan.search.recent.${workspaceId}`, JSON.stringify(recent));
  } catch {
    // Search remains usable when the device cannot persist its history.
  }
}
