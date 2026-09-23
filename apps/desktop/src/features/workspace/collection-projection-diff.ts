import type { CollectionLot } from "@mooligan/workspace/collection-contract";
import type { CollectionProjectionDelta } from "@mooligan/workspace/transport";

export function diffCollectionLots(
  previous: readonly CollectionLot[],
  next: readonly CollectionLot[],
) {
  const previousById = new Map(previous.map((lot) => [lot.id, lot]));
  const nextById = new Map(next.map((lot) => [lot.id, lot]));
  const upserts = next.filter((lot) => {
    const before = previousById.get(lot.id);
    return !before || !collectionLotsEqual(before, lot);
  });
  const deletedLotIds = previous.filter(({ id }) => !nextById.has(id)).map(({ id }) => id);
  return { deletedLotIds, upserts } satisfies Pick<
    CollectionProjectionDelta,
    "deletedLotIds" | "upserts"
  >;
}

function collectionLotsEqual(left: CollectionLot, right: CollectionLot) {
  return (
    left.id === right.id &&
    left.printingId === right.printingId &&
    left.finish === right.finish &&
    left.language === right.language &&
    left.condition === right.condition &&
    left.quantity === right.quantity &&
    left.acquiredAt === right.acquiredAt &&
    left.locationId === right.locationId &&
    left.notes === right.notes &&
    left.unitCost?.amountMinor === right.unitCost?.amountMinor &&
    left.unitCost?.currency === right.unitCost?.currency
  );
}
