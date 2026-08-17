import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

const BACKGROUND_IMAGE_CONCURRENCY = 6;
const INITIAL_IMAGE_TIMEOUT_MS = 5_000;

type ImageState = "background" | "foreground" | "pending" | "settled";

type TimerApi = {
  schedule: (callback: () => void, delay: number) => () => void;
};

const defaultTimers: TimerApi = {
  schedule: (callback, delay) => {
    const handle = globalThis.setTimeout(callback, delay);
    return () => globalThis.clearTimeout(handle);
  },
};

type ActiveImages = {
  failed: ReadonlySet<string>;
  generation: number;
  ids: ReadonlySet<string>;
};

export function useCatalogImageLoading<Element extends HTMLElement, ResetKey>(
  containerRef: RefObject<Element | null>,
  imageIds: readonly string[],
  resetKey: ResetKey,
  enabled = true,
  rootMargin = "0px",
) {
  const observerRef = useRef<IntersectionObserver>(null);
  const generationRef = useRef(0);
  const [active, setActive] = useState<ActiveImages>({
    failed: new Set(),
    generation: 0,
    ids: new Set(),
  });
  const coordinator = useMemo(
    () =>
      new CatalogImageLoading((id, generation) => {
        setActive((current) => {
          if (current.generation !== generation) {
            return { failed: new Set(), generation, ids: new Set([id]) };
          }
          if (current.ids.has(id)) {
            return current;
          }

          const ids = new Set(current.ids);
          ids.add(id);
          return { ...current, ids };
        });
      }),
    [],
  );

  useLayoutEffect(() => {
    const generation = coordinator.reset();
    generationRef.current = generation;
    setActive({ failed: new Set(), generation, ids: new Set() });

    const Observer = globalThis.IntersectionObserver;
    if (!enabled || !Observer) {
      return () => coordinator.reset();
    }

    let initialObservation = true;
    const observer = new Observer(
      (entries) => {
        const visibleIds = entries.flatMap((entry) => {
          if (!(entry.target instanceof HTMLElement)) return [];
          const id = entry.target.dataset.catalogImageId;
          return entry.isIntersecting && id ? [id] : [];
        });

        if (initialObservation) {
          initialObservation = false;
          coordinator.initialVisible(visibleIds, generation);
        } else {
          coordinator.visible(visibleIds, generation);
        }
      },
      { root: null, rootMargin },
    );
    observerRef.current = observer;

    return () => {
      observer.disconnect();
      observerRef.current = null;
      coordinator.reset();
    };
  }, [coordinator, enabled, resetKey, rootMargin]);

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    const generation = generationRef.current;
    coordinator.append(imageIds, generation);
    const observer = observerRef.current;

    if (!observer) {
      coordinator.initialVisible(imageIds, generation);
      return;
    }

    const frames = containerRef.current?.querySelectorAll<HTMLElement>("[data-catalog-image-id]");
    frames?.forEach((frame) => observer.observe(frame));
    return () => frames?.forEach((frame) => observer.unobserve(frame));
  }, [containerRef, coordinator, enabled, imageIds]);

  return {
    ...active,
    settle(id: string, failed = false) {
      coordinator.settled(id, active.generation);
      if (!failed) {
        return;
      }

      setActive((current) => {
        if (current.generation !== active.generation || current.failed.has(id)) {
          return current;
        }
        const nextFailed = new Set(current.failed);
        nextFailed.add(id);
        return { ...current, failed: nextFailed };
      });
    },
  };
}

export class CatalogImageLoading {
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
  #cancelSafetyTimeout: (() => void) | undefined;

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
    if (this.#cancelSafetyTimeout) {
      this.#cancelSafetyTimeout();
      this.#cancelSafetyTimeout = undefined;
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
    if (this.#backgroundReleased || this.#cancelSafetyTimeout || this.#order.length === 0) {
      return;
    }

    const generation = this.#generation;
    this.#cancelSafetyTimeout = this.#timers.schedule(() => {
      this.#cancelSafetyTimeout = undefined;
      if (generation === this.#generation) {
        this.#releaseBackground();
      }
    }, INITIAL_IMAGE_TIMEOUT_MS);
  }
}
