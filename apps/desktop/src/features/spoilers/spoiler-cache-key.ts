import type { SpoilerState } from "@mooligan/domain/spoilers";

export function spoilerCatalogCacheKey(state: SpoilerState) {
  return JSON.stringify([state.policy, state.activePrintingIds, state.activeRootSetIds]);
}
