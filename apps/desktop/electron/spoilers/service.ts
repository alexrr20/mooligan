import {
  SpoilerPolicySchema,
  SpoilerStateSchema,
  SpoilerVisibilitySnapshotSchema,
  type SpoilerPolicy,
  type SpoilerState,
  type SpoilerVisibilitySnapshot,
} from "@mooligan/domain/spoilers";

export interface SpoilerWorkspace {
  protectAllSpoilers(): SpoilerState;
  protectSpoilerPrinting(printingId: string): SpoilerState;
  protectSpoilerRelease(rootSetId: string): SpoilerState;
  readSpoilerState(): SpoilerState;
  revealSpoilerPrinting(printingId: string): SpoilerState;
  revealSpoilerRelease(rootSetId: string): SpoilerState;
  setSpoilerPolicy(policy: SpoilerPolicy): SpoilerState;
}

export interface SpoilerServiceOptions {
  clearTimer?: (timer: SpoilerTimer) => void;
  now?: () => Date;
  setTimer?: (callback: () => void, delayMilliseconds: number) => SpoilerTimer;
}

type SpoilerStateListener = (state: SpoilerState) => void;
type SpoilerTimer = ReturnType<typeof setTimeout>;

export class SpoilerService {
  readonly #clearTimer: (timer: SpoilerTimer) => void;
  readonly #listeners = new Set<SpoilerStateListener>();
  readonly #now: () => Date;
  readonly #setTimer: (callback: () => void, delayMilliseconds: number) => SpoilerTimer;
  readonly #workspace: SpoilerWorkspace;
  #state: SpoilerState;
  #storedState: SpoilerState;
  #timer: SpoilerTimer | undefined;

  constructor(workspace: SpoilerWorkspace, options: SpoilerServiceOptions = {}) {
    this.#workspace = workspace;
    this.#now = options.now ?? (() => new Date());
    this.#setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    this.#storedState = SpoilerStateSchema.parse(workspace.readSpoilerState());
    this.#state = copyState(this.#storedState);
    this.#scheduleMidnightRefresh();
  }

  snapshot(): SpoilerState {
    return copyState(this.#state);
  }

  visibilitySnapshot(): SpoilerVisibilitySnapshot {
    const state = SpoilerStateSchema.parse(this.#workspace.readSpoilerState());
    return SpoilerVisibilitySnapshotSchema.parse({
      currentDate: localDate(this.#readNow()),
      policy: state.policy,
      revealedPrintingIds: state.activePrintingIds,
      revealedRootSetIds: state.activeRootSetIds,
      revision: state.revision,
    });
  }

  refresh(): SpoilerState {
    return this.#publish(this.#workspace.readSpoilerState());
  }

  subscribe(listener: SpoilerStateListener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  setPolicy(policy: SpoilerPolicy): SpoilerState {
    return this.#publish(this.#workspace.setSpoilerPolicy(SpoilerPolicySchema.parse(policy)));
  }

  revealPrinting(printingId: string): SpoilerState {
    return this.#publish(this.#workspace.revealSpoilerPrinting(printingId));
  }

  protectPrinting(printingId: string): SpoilerState {
    return this.#publish(this.#workspace.protectSpoilerPrinting(printingId));
  }

  revealRelease(rootSetId: string): SpoilerState {
    return this.#publish(this.#workspace.revealSpoilerRelease(rootSetId));
  }

  protectRelease(rootSetId: string): SpoilerState {
    return this.#publish(this.#workspace.protectSpoilerRelease(rootSetId));
  }

  protectAll(): SpoilerState {
    return this.#publish(this.#workspace.protectAllSpoilers());
  }

  close() {
    if (this.#timer !== undefined) {
      this.#clearTimer(this.#timer);
      this.#timer = undefined;
    }
    this.#listeners.clear();
  }

  #publish(value: SpoilerState, force = false) {
    const stored = SpoilerStateSchema.parse(value);
    if (!force && spoilerStatesEqual(stored, this.#storedState)) {
      return this.snapshot();
    }

    this.#storedState = copyState(stored);
    this.#state = SpoilerStateSchema.parse({
      ...stored,
      revision: Math.max(stored.revision, this.#state.revision + 1),
    });

    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  #scheduleMidnightRefresh() {
    if (this.#timer !== undefined) {
      this.#clearTimer(this.#timer);
    }

    const now = this.#readNow();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const delay = Math.max(1, midnight.getTime() - now.getTime());

    this.#timer = this.#setTimer(() => {
      this.#timer = undefined;
      this.#publish(this.#workspace.readSpoilerState(), true);
      this.#scheduleMidnightRefresh();
    }, delay);
  }

  #readNow() {
    const now = this.#now();
    if (!Number.isFinite(now.getTime())) {
      throw new TypeError("The spoiler clock returned an invalid date.");
    }
    return new Date(now.getTime());
  }
}

export function protectSpoilerState(value: SpoilerState): SpoilerState {
  const state = SpoilerStateSchema.parse(value);
  return {
    activePrintingIds: [],
    activeRootSetIds: [],
    policy: "protect",
    revision: state.revision,
  };
}

export function protectSpoilerVisibility(
  value: SpoilerVisibilitySnapshot,
): SpoilerVisibilitySnapshot {
  const snapshot = SpoilerVisibilitySnapshotSchema.parse(value);
  return {
    currentDate: snapshot.currentDate,
    policy: "protect",
    revealedPrintingIds: [],
    revealedRootSetIds: [],
    revision: snapshot.revision,
  };
}

export function releaseProtectionTarget(
  state: SpoilerState,
  targetId: string,
  resolvedRootSetId: string | null,
) {
  const spoilers = SpoilerStateSchema.parse(state);
  return resolvedRootSetId ?? (spoilers.activeRootSetIds.includes(targetId) ? targetId : null);
}

function copyState(state: SpoilerState): SpoilerState {
  return {
    activePrintingIds: [...state.activePrintingIds],
    activeRootSetIds: [...state.activeRootSetIds],
    policy: state.policy,
    revision: state.revision,
  };
}

function spoilerStatesEqual(left: SpoilerState, right: SpoilerState) {
  return (
    left.policy === right.policy &&
    left.revision === right.revision &&
    arraysEqual(left.activePrintingIds, right.activePrintingIds) &&
    arraysEqual(left.activeRootSetIds, right.activeRootSetIds)
  );
}

function arraysEqual(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function localDate(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
