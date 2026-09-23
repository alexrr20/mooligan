import type { Store } from "@livestore/livestore";
import type { CollectionPrintingValidationRequest } from "@mooligan/domain/collection";
import { Schema } from "effect";

import { collectionLotsQuery } from "../collection.ts";
import {
  AddCollectionHoldingRequestSchema,
  RemoveCollectionHoldingRequestSchema,
  UpdateCollectionHoldingRequestSchema,
  collectionHoldingKey,
  isUnattributedLot,
  type AddCollectionHoldingRequest,
  type CollectionLot,
  type CollectionMutationResult,
  type RemoveCollectionHoldingRequest,
  type UpdateCollectionHoldingRequest,
} from "../collection-contract.ts";
import { events, workspaceSchema } from "../schema.ts";

const decodeAddRequest = Schema.decodeSync(AddCollectionHoldingRequestSchema);
const decodeRemoveRequest = Schema.decodeSync(RemoveCollectionHoldingRequestSchema);
const decodeUpdateRequest = Schema.decodeSync(UpdateCollectionHoldingRequestSchema);

type ValidateCollectionPrinting = (request: CollectionPrintingValidationRequest) => Promise<void>;

export function createCollectionMutations(
  store: Store<typeof workspaceSchema>,
  validatePrinting: ValidateCollectionPrinting,
) {
  return {
    async add(request: AddCollectionHoldingRequest): Promise<CollectionMutationResult> {
      request = decodeAddRequest(request);
      await validatePrinting({ finish: request.finish, printingId: request.printingId });
      const existing = store
        .query(collectionLotsQuery)
        .find((lot) => sameHolding(lot, request) && isUnattributedLot(lot));
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
        .find((lot) => sameHolding(lot, request) && isUnattributedLot(lot));
      if (!target) throw new Error("The Collection quantity is too large.");
      return { holdingQuantity: target.quantity, lotId: target.id };
    },

    async remove(request: RemoveCollectionHoldingRequest) {
      request = decodeRemoveRequest(request);
      const source = store.query(collectionLotsQuery).find(({ id }) => id === request.lotId);
      if (!source || !isUnattributedLot(source)) {
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
      request = decodeUpdateRequest(request);
      const source = store.query(collectionLotsQuery).find(({ id }) => id === request.lotId);
      if (!source || !isUnattributedLot(source)) {
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
            isUnattributedLot(lot),
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
            sameHolding(lot, { ...request, printingId: source.printingId }) &&
            isUnattributedLot(lot),
        );
      if (!target) throw new Error("The Collection quantity is too large.");
      return { holdingQuantity: target.quantity, lotId: target.id };
    },
  };
}

function sameHolding(
  lot: CollectionLot,
  key: Pick<CollectionLot, "condition" | "finish" | "language" | "printingId">,
) {
  return collectionHoldingKey(lot) === collectionHoldingKey(key);
}
