import { randomUUID } from "node:crypto";

import type { CollectionLot } from "@mooligan/workspace/collection-contract";
import type {
  CollectionProjectionConnection,
  CollectionProjectionResult,
} from "@mooligan/domain/collection";
import type {
  CollectionProjectionDelta,
  CollectionProjectionSnapshot,
} from "@mooligan/workspace/transport";

type ProjectionSession = {
  id: string;
  rendererId: number;
  revision: number;
  workspaceId: string;
};

export type CollectionProjectionOptions = {
  applyDelta?: (
    delta: Pick<CollectionProjectionDelta, "deletedLotIds" | "upserts">,
  ) => Promise<void>;
  onResyncRequired?: () => void;
  replace?: (lots: CollectionLot[]) => Promise<void>;
};

export class CollectionProjection {
  readonly #activeWorkspaceId: () => string;
  readonly #applyDelta: NonNullable<CollectionProjectionOptions["applyDelta"]>;
  readonly #lots = new Map<string, CollectionLot>();
  readonly #onResyncRequired: () => void;
  readonly #replace: NonNullable<CollectionProjectionOptions["replace"]>;
  #ready = false;
  #session: ProjectionSession | undefined;

  constructor(activeWorkspaceId: () => string, options: CollectionProjectionOptions = {}) {
    this.#activeWorkspaceId = activeWorkspaceId;
    this.#applyDelta = options.applyDelta ?? (() => Promise.resolve());
    this.#onResyncRequired = options.onResyncRequired ?? (() => undefined);
    this.#replace = options.replace ?? (() => Promise.resolve());
  }

  async connect(rendererId: number, workspaceId: string): Promise<CollectionProjectionConnection> {
    await this.#clear();
    if (workspaceId !== this.#activeWorkspaceId()) {
      throw new Error("The active workspace changed before the Collection connected.");
    }

    const sessionId = randomUUID();
    this.#session = { id: sessionId, rendererId, revision: 0, workspaceId };
    return { sessionId, workspaceId };
  }

  async replace(
    rendererId: number,
    snapshot: CollectionProjectionSnapshot,
  ): Promise<CollectionProjectionResult> {
    if (!this.#matches(rendererId, snapshot)) {
      return this.#requireResync();
    }

    await this.#replace(snapshot.lots);
    this.#lots.clear();
    for (const lot of snapshot.lots) this.#lots.set(lot.id, lot);
    this.#ready = true;
    this.#session!.revision = snapshot.revision;
    return { revision: snapshot.revision, status: "applied" };
  }

  async apply(
    rendererId: number,
    delta: CollectionProjectionDelta,
  ): Promise<CollectionProjectionResult> {
    if (!this.#matches(rendererId, delta) || delta.revision !== this.#session!.revision + 1) {
      return this.#requireResync();
    }

    await this.#applyDelta({ deletedLotIds: delta.deletedLotIds, upserts: delta.upserts });
    for (const lotId of delta.deletedLotIds) this.#lots.delete(lotId);
    for (const lot of delta.upserts) this.#lots.set(lot.id, lot);
    this.#ready = true;
    this.#session!.revision = delta.revision;
    return { revision: delta.revision, status: "applied" };
  }

  isReady() {
    return this.#ready && this.#session?.workspaceId === this.#activeWorkspaceId();
  }

  lots() {
    return this.isReady() ? [...this.#lots.values()] : [];
  }

  rendererReplaced(rendererId: number) {
    if (this.#session?.rendererId === rendererId) {
      this.#session = undefined;
      void this.#clear().catch(() => undefined);
    }
  }

  rejectInvalidUpdate(rendererId: number) {
    if (this.#session?.rendererId === rendererId) {
      void this.#clear().catch(() => undefined);
    }
  }

  workerInvalidated() {
    if (!this.#ready && !this.#session) return;
    this.#lots.clear();
    this.#ready = false;
    this.#session = undefined;
    this.#onResyncRequired();
  }

  async workspaceChanged() {
    this.#session = undefined;
    await this.#clear();
  }

  async #requireResync(): Promise<CollectionProjectionResult> {
    await this.#clear();
    return { status: "resync-required" };
  }

  async #clear() {
    this.#lots.clear();
    this.#ready = false;
    await this.#replace([]);
  }

  #matches(
    rendererId: number,
    value: Pick<CollectionProjectionSnapshot, "sessionId" | "workspaceId">,
  ) {
    return (
      this.#session !== undefined &&
      this.#session.id === value.sessionId &&
      this.#session.rendererId === rendererId &&
      this.#session.workspaceId === value.workspaceId &&
      value.workspaceId === this.#activeWorkspaceId()
    );
  }
}
