import type { CollectionLot, CollectionProjectionConnection } from "@mooligan/domain/collection";
import { collectionLotsQuery, tables } from "@mooligan/workspace/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useWorkspaceLiveStore } from "./workspace-store-context";
import { diffCollectionLots } from "./collection-projection-diff";

export function CollectionProjectionStartup({
  children,
  loading,
  workspaceId,
}: {
  children: ReactNode;
  loading: ReactNode;
  workspaceId: string;
}) {
  const store = useWorkspaceLiveStore();
  const queryClient = useQueryClient();
  const rows = store.useQuery(collectionLotsQuery);
  const lots = useMemo(() => rows.map(toCollectionLot), [rows]);
  const connection = useRef<CollectionProjectionConnection>(undefined);
  const lastLots = useRef<CollectionLot[]>(undefined);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const workerResync = useRef(false);
  const [ready, setReady] = useState(false);
  const [resyncGeneration, setResyncGeneration] = useState(0);
  const [failure, setFailure] = useState<Error>();

  useLayoutEffect(() => {
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        connection.current ??= await window.workspaceProjection.connectCollection(workspaceId);
        const previous = lastLots.current;
        const delta = previous ? diffCollectionLots(previous, lots) : undefined;
        if (delta && delta.deletedLotIds.length + delta.upserts.length === 0) {
          lastLots.current = lots;
          setReady(true);
          return;
        }

        revision.current += 1;
        const identity = { ...connection.current, revision: revision.current };
        let result;

        if (delta && delta.deletedLotIds.length <= 1_000 && delta.upserts.length <= 1_000) {
          result = await window.workspaceProjection.applyCollectionDelta({ ...identity, ...delta });
        } else {
          result = await window.workspaceProjection.replaceCollection({ ...identity, lots });
        }

        if (result.status !== "applied") {
          result = await window.workspaceProjection.replaceCollection({ ...identity, lots });
        }
        if (result.status !== "applied") {
          throw new Error("The Collection projection could not be synchronized.");
        }

        workerResync.current = false;
        lastLots.current = lots;
        setReady(true);
        await queryClient.invalidateQueries({ queryKey: ["collection"] });
      })
      .catch((cause: unknown) => {
        if (workerResync.current) {
          workerResync.current = false;
          return;
        }
        setFailure(cause instanceof Error ? cause : new Error(String(cause)));
      });
  }, [lots, queryClient, resyncGeneration, workspaceId]);

  useEffect(
    () =>
      window.workspaceProjection.onCollectionResyncRequired(() => {
        workerResync.current = true;
        connection.current = undefined;
        lastLots.current = undefined;
        revision.current = 0;
        queryClient.removeQueries({ queryKey: ["collection"] });
        setResyncGeneration((generation) => generation + 1);
      }),
    [queryClient],
  );

  if (failure) throw failure;
  return ready ? children : loading;
}

function toCollectionLot(row: typeof tables.collectionLots.Type): CollectionLot {
  const lot: CollectionLot = {
    condition: row.condition,
    finish: row.finish,
    id: row.id,
    language: row.language,
    printingId: row.printingId,
    quantity: row.quantity,
  };
  if (row.acquiredAt !== null) lot.acquiredAt = row.acquiredAt;
  if (row.locationId !== null) lot.locationId = row.locationId;
  if (row.notes !== null) lot.notes = row.notes;
  if (row.unitCostAmountMinor !== null && row.unitCostCurrency !== null) {
    lot.unitCost = { amountMinor: row.unitCostAmountMinor, currency: row.unitCostCurrency };
  }
  return lot;
}
