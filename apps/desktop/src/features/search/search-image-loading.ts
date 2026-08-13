const BACKGROUND_IMAGE_CONCURRENCY = 6;
const INITIAL_IMAGE_TIMEOUT_MS = 5_000;

type ImageState = "background" | "foreground" | "pending" | "settled";

type TimerApi = {
  clearTimeout: (handle: unknown) => void;
  setTimeout: (callback: () => void, delay: number) => unknown;
};

const defaultTimers: TimerApi = {
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay),
};

export class SearchImageLoading {
  readonly #activate: (id: string, generation: number) => void;
  readonly #timers: TimerApi;
  readonly #states = new Map<string, ImageState>();
  readonly #initialImages = new Set<string>();
  #backgroundActive = 0;
  #backgroundReleased = false;
  #generation = 0;
  #initialReported = false;
  #nextPendingIndex = 0;
  #order: string[] = [];
  #timeout: unknown;

  constructor(
    activate: (id: string, generation: number) => void,
    timers: TimerApi = defaultTimers,
  ) {
    this.#activate = activate;
    this.#timers = timers;
  }

  reset(ids: readonly string[] = []) {
    this.#clearSafetyTimeout();
    this.#generation += 1;
    this.#states.clear();
    this.#initialImages.clear();
    this.#backgroundActive = 0;
    this.#backgroundReleased = false;
    this.#initialReported = false;
    this.#nextPendingIndex = 0;
    this.#order = [];
    this.append(ids, this.#generation);
    return this.#generation;
  }

  append(ids: readonly string[], generation: number) {
    if (generation !== this.#generation) {
      return;
    }

    let appended = false;
    for (const id of ids) {
      if (!this.#states.has(id)) {
        this.#states.set(id, "pending");
        this.#order.push(id);
        appended = true;
      }
    }

    if (appended) {
      this.#startSafetyTimeout();
      this.#fillBackground();
    }
  }

  initialVisible(ids: readonly string[], generation: number) {
    if (generation !== this.#generation) {
      return;
    }
    if (this.#initialReported) {
      this.visible(ids, generation);
      return;
    }

    this.#activateVisible(ids, true);
    this.#initialReported = true;
    this.#releaseBackgroundIfReady();
  }

  visible(ids: readonly string[], generation: number) {
    if (generation === this.#generation) {
      this.#activateVisible(ids, false);
    }
  }

  settled(id: string, generation: number) {
    if (generation !== this.#generation) {
      return;
    }

    const state = this.#states.get(id);
    if (state !== "foreground" && state !== "background") {
      return;
    }

    this.#states.set(id, "settled");
    if (state === "foreground") {
      this.#initialImages.delete(id);
    } else {
      this.#backgroundActive -= 1;
    }

    if (!this.#backgroundReleased) {
      this.#releaseBackgroundIfReady();
    } else if (state === "background") {
      this.#fillBackground();
    }
  }

  #activateVisible(ids: readonly string[], initial: boolean) {
    for (const id of ids) {
      if (this.#states.get(id) !== "pending") {
        continue;
      }

      this.#states.set(id, "foreground");
      if (initial) {
        this.#initialImages.add(id);
      }
      this.#activate(id, this.#generation);
    }
  }

  #clearSafetyTimeout() {
    if (this.#timeout !== undefined) {
      this.#timers.clearTimeout(this.#timeout);
      this.#timeout = undefined;
    }
  }

  #fillBackground() {
    if (!this.#backgroundReleased) {
      return;
    }

    while (
      this.#backgroundActive < BACKGROUND_IMAGE_CONCURRENCY &&
      this.#nextPendingIndex < this.#order.length
    ) {
      const id = this.#order[this.#nextPendingIndex];
      this.#nextPendingIndex += 1;
      if (this.#states.get(id) !== "pending") {
        continue;
      }

      this.#states.set(id, "background");
      this.#backgroundActive += 1;
      this.#activate(id, this.#generation);
    }
  }

  #releaseBackground() {
    if (this.#backgroundReleased) {
      return;
    }

    this.#backgroundReleased = true;
    this.#clearSafetyTimeout();
    this.#fillBackground();
  }

  #releaseBackgroundIfReady() {
    if (this.#initialReported && this.#initialImages.size === 0) {
      this.#releaseBackground();
    }
  }

  #startSafetyTimeout() {
    if (this.#backgroundReleased || this.#timeout !== undefined || this.#order.length === 0) {
      return;
    }

    const generation = this.#generation;
    this.#timeout = this.#timers.setTimeout(() => {
      this.#timeout = undefined;
      if (generation === this.#generation) {
        this.#releaseBackground();
      }
    }, INITIAL_IMAGE_TIMEOUT_MS);
  }
}
