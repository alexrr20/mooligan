import type { Store } from "@livestore/livestore";
import type {
  AddCollectionHoldingRequest,
  CollectionMutationResult,
  RemoveCollectionHoldingRequest,
  UpdateCollectionHoldingRequest,
} from "@mooligan/domain/collection";
import { collectionLotsQuery, events, tables, workspaceSchema } from "@mooligan/workspace/schema";

type ValidateCollectionPrinting = (request: {
  existingFinish?: "etched" | "foil" | "glossy" | "nonfoil";
  finish: "etched" | "foil" | "glossy" | "nonfoil";
  printingId: string;
}) => Promise<void>;

export function createCollectionMutations(
  store: Store<typeof workspaceSchema>,
  validatePrinting: ValidateCollectionPrinting,
) {
  return {
    async add(request: AddCollectionHoldingRequest): Promise<CollectionMutationResult> {
      await validatePrinting(request);
      const existing = store
        .query(collectionLotsQuery)
        .find((lot) => sameHolding(lot, request) && isUnattributed(lot));
      if (existing && !Number.isSafeInteger(existing.quantity + request.quantity)) {
        throw new Error("The Collection quantity is too large.");
      }
      const lotId = crypto.randomUUID();
      store.commit(
        events.collectionCopiesAdded({
          additionId: crypto.randomUUID(),
          lot: {
            acquiredAt: null,
            condition: request.condition,
            finish: request.finish,
            id: lotId,
            language: request.language,
            locationId: null,
            notes: null,
            printingId: request.printingId,
            quantity: request.quantity,
            unitCost: null,
          },
        }),
      );

      const target = store
        .query(collectionLotsQuery)
        .find((lot) => sameHolding(lot, request) && isUnattributed(lot));
      if (!target) throw new Error("The Collection quantity is too large.");
      return { holdingQuantity: target.quantity, lotId: target.id };
    },

    async remove(request: RemoveCollectionHoldingRequest) {
      const source = store.query(collectionLotsQuery).find(({ id }) => id === request.lotId);
      if (!source || !isUnattributed(source)) {
        throw new Error("This Collection holding cannot be removed.");
      }
      store.commit(
        events.collectionLotRemoved({ lotId: request.lotId, removalId: crypto.randomUUID() }),
      );
      if (store.query(collectionLotsQuery).some(({ id }) => id === request.lotId)) {
        throw new Error("This Collection holding could not be removed.");
      }
    },

    async update(request: UpdateCollectionHoldingRequest): Promise<CollectionMutationResult> {
      const source = store.query(collectionLotsQuery).find(({ id }) => id === request.lotId);
      if (!source || !isUnattributed(source)) {
        throw new Error("This Collection holding cannot be edited.");
      }
      await validatePrinting({
        existingFinish: source.finish,
        finish: request.finish,
        printingId: source.printingId,
      });
      const existingTarget = store
        .query(collectionLotsQuery)
        .find(
          (lot) =>
            lot.id !== source.id &&
            sameHolding(lot, { ...request, printingId: source.printingId }) &&
            isUnattributed(lot),
        );
      if (existingTarget && !Number.isSafeInteger(existingTarget.quantity + request.quantity)) {
        throw new Error("The Collection quantity is too large.");
      }
      store.commit(
        events.collectionLotChanged({
          changeId: crypto.randomUUID(),
          condition: request.condition,
          finish: request.finish,
          language: request.language,
          lotId: request.lotId,
          quantity: request.quantity,
        }),
      );

      const target = store
        .query(collectionLotsQuery)
        .find(
          (lot) =>
            sameHolding(lot, { ...request, printingId: source.printingId }) && isUnattributed(lot),
        );
      if (!target) throw new Error("The Collection quantity is too large.");
      return { holdingQuantity: target.quantity, lotId: target.id };
    },
  };
}

type CollectionLotRow = typeof tables.collectionLots.Type;

function sameHolding(
  lot: CollectionLotRow,
  key: Pick<CollectionLotRow, "condition" | "finish" | "language" | "printingId">,
) {
  return (
    lot.printingId === key.printingId &&
    lot.finish === key.finish &&
    lot.language === key.language &&
    lot.condition === key.condition
  );
}

function isUnattributed(lot: CollectionLotRow) {
  return (
    lot.acquiredAt === null &&
    lot.locationId === null &&
    lot.notes === null &&
    lot.unitCostAmountMinor === null &&
    lot.unitCostCurrency === null
  );
}
