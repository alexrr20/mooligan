import {
  SpoilerVisibilitySnapshotSchema,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";

const MAX_STABLE_VISIBILITY_ATTEMPTS = 2;

export type StableCatalogRead<Result> = {
  result: Result;
  visibility: SpoilerVisibilitySnapshot;
};

export async function readWithStableCatalogVisibility<Result>(
  readVisibility: () => SpoilerVisibilitySnapshot,
  read: (visibility: SpoilerVisibilitySnapshot) => Promise<Result>,
): Promise<StableCatalogRead<Result>> {
  for (let attempt = 0; attempt < MAX_STABLE_VISIBILITY_ATTEMPTS; attempt += 1) {
    const before = SpoilerVisibilitySnapshotSchema.parse(readVisibility());
    const result = await read(before);
    const after = SpoilerVisibilitySnapshotSchema.parse(readVisibility());

    if (catalogVisibilitySnapshotsEqual(before, after)) {
      return { result, visibility: after };
    }
  }

  throw new CatalogVisibilityChangedError();
}

export function catalogVisibilitySnapshotsEqual(
  left: SpoilerVisibilitySnapshot,
  right: SpoilerVisibilitySnapshot,
) {
  return (
    left.currentDate === right.currentDate &&
    left.policy === right.policy &&
    left.revision === right.revision &&
    arraysEqual(left.revealedPrintingIds, right.revealedPrintingIds) &&
    arraysEqual(left.revealedRootSetIds, right.revealedRootSetIds)
  );
}

export class CatalogVisibilityChangedError extends Error {
  constructor() {
    super("Catalog visibility changed while reading.");
    this.name = "CatalogVisibilityChangedError";
  }
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
