import { randomUUID } from "node:crypto";

import type {
  SpoilerProjectionConnection,
  SpoilerProjectionDecision,
  SpoilerProjectionDelta,
  SpoilerProjectionResult,
  SpoilerProjectionSnapshot,
  SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";

type ProjectionTimer = ReturnType<typeof setTimeout>;

export type SpoilerProjectionOptions = {
  clearTimer?: (timer: ProjectionTimer) => void;
  now?: () => Date;
  onChanged?: () => void;
  setTimer?: (callback: () => void, delayMilliseconds: number) => ProjectionTimer;
};

type ProjectionSession = {
  id: string;
  rendererId: number;
  revision: number;
  workspaceId: string;
};

export class SpoilerProjection {
  readonly #activeWorkspaceId: () => string;
  readonly #clearTimer: (timer: ProjectionTimer) => void;
  readonly #decisions = new Map<string, SpoilerProjectionDecision>();
  readonly #now: () => Date;
  readonly #onChanged: () => void;
  readonly #setTimer: (callback: () => void, delayMilliseconds: number) => ProjectionTimer;
  #authorizationRevision = 0;
  #policy: "protect" | "show" = "protect";
  #ready = false;
  #session: ProjectionSession | undefined;
  #timer: ProjectionTimer | undefined;

  constructor(activeWorkspaceId: () => string, options: SpoilerProjectionOptions = {}) {
    this.#activeWorkspaceId = activeWorkspaceId;
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    this.#now = options.now ?? (() => new Date());
    this.#onChanged = options.onChanged ?? (() => undefined);
    this.#setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.#scheduleMidnightRefresh();
  }

  connect(rendererId: number, workspaceId: string): SpoilerProjectionConnection {
    this.#protect();

    if (workspaceId !== this.#activeWorkspaceId()) {
      throw new Error("The active workspace changed before spoiler protection connected.");
    }

    const sessionId = randomUUID();
    this.#session = { id: sessionId, rendererId, revision: 0, workspaceId };
    return { sessionId, workspaceId };
  }

  replace(rendererId: number, snapshot: SpoilerProjectionSnapshot): SpoilerProjectionResult {
    if (!this.#matches(rendererId, snapshot)) {
      return this.#requireResync();
    }

    this.#decisions.clear();
    for (const decision of snapshot.decisions) {
      this.#decisions.set(decisionKey(decision), decision);
    }
    this.#policy = snapshot.policy;
    this.#ready = true;
    this.#session!.revision = snapshot.revision;
    this.#changed();
    return { revision: snapshot.revision, status: "applied" };
  }

  apply(rendererId: number, delta: SpoilerProjectionDelta): SpoilerProjectionResult {
    if (!this.#matches(rendererId, delta) || delta.revision !== this.#session!.revision + 1) {
      return this.#requireResync();
    }

    for (const decision of delta.decisions) {
      this.#decisions.set(decisionKey(decision), decision);
    }
    if (delta.policy !== undefined) {
      this.#policy = delta.policy;
    }
    this.#session!.revision = delta.revision;
    this.#ready = true;
    this.#changed();
    return { revision: delta.revision, status: "applied" };
  }

  rendererReplaced(rendererId: number) {
    if (this.#session?.rendererId === rendererId) {
      this.#session = undefined;
      this.#protect();
    }
  }

  workspaceChanged() {
    this.#session = undefined;
    this.#protect();
  }

  rejectInvalidUpdate(rendererId: number) {
    if (this.#session?.rendererId === rendererId) {
      this.#protect();
    }
  }

  visibilitySnapshot(): SpoilerVisibilitySnapshot {
    const ready = this.#ready && this.#session?.workspaceId === this.#activeWorkspaceId();
    const reveals = ready
      ? [...this.#decisions.values()].filter(({ state }) => state === "reveal")
      : [];

    return {
      currentDate: localDate(this.#readNow()),
      policy: ready ? this.#policy : "protect",
      revealedPrintingIds: reveals
        .filter(({ scope }) => scope === "printing")
        .map(({ targetId }) => targetId)
        .sort(),
      revealedRootSetIds: reveals
        .filter(({ scope }) => scope === "release")
        .map(({ targetId }) => targetId)
        .sort(),
      revision: this.#authorizationRevision,
    };
  }

  close() {
    if (this.#timer !== undefined) {
      this.#clearTimer(this.#timer);
      this.#timer = undefined;
    }
    this.#session = undefined;
    this.#decisions.clear();
  }

  #matches(
    rendererId: number,
    value: Pick<SpoilerProjectionSnapshot, "sessionId" | "workspaceId">,
  ) {
    return (
      this.#session !== undefined &&
      this.#session.id === value.sessionId &&
      this.#session.rendererId === rendererId &&
      this.#session.workspaceId === value.workspaceId &&
      value.workspaceId === this.#activeWorkspaceId()
    );
  }

  #requireResync(): SpoilerProjectionResult {
    this.#protect();
    return { status: "resync-required" };
  }

  #protect() {
    this.#decisions.clear();
    this.#policy = "protect";
    this.#ready = false;
    this.#changed();
  }

  #changed() {
    this.#authorizationRevision += 1;
    this.#onChanged();
  }

  #scheduleMidnightRefresh() {
    if (this.#timer !== undefined) {
      this.#clearTimer(this.#timer);
    }

    const now = this.#readNow();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    this.#timer = this.#setTimer(
      () => {
        this.#timer = undefined;
        this.#changed();
        this.#scheduleMidnightRefresh();
      },
      Math.max(1, midnight.getTime() - now.getTime()),
    );
  }

  #readNow() {
    const now = this.#now();
    if (!Number.isFinite(now.getTime())) {
      throw new TypeError("The spoiler clock returned an invalid date.");
    }
    return new Date(now.getTime());
  }
}

function decisionKey({ scope, targetId }: Pick<SpoilerProjectionDecision, "scope" | "targetId">) {
  return `${scope}\0${targetId}`;
}

function localDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
