type PendingQuery = {
  start: () => void;
  reject: (error: Error) => void;
};

export class CatalogQueryQueue {
  readonly #pending = new Set<PendingQuery>();
  #running = false;

  run<Result>(read: () => Promise<Result>, signal?: AbortSignal): Promise<Result> {
    if (signal?.aborted) return Promise.reject(new DOMException("Search cancelled.", "AbortError"));

    return new Promise<Result>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener("abort", abort);
      const pending: PendingQuery = {
        reject: (error) => {
          cleanup();
          reject(error);
        },
        start: () => {
          this.#running = true;
          // Cancelling a running read must not free the worker until it actually finishes.
          void Promise.resolve()
            .then(() => {
              signal?.throwIfAborted();
              return read();
            })
            .then(resolve, reject)
            .finally(() => {
              cleanup();
              this.#running = false;
              this.#next();
            });
        },
      };
      const abort = () => {
        this.#pending.delete(pending);
        pending.reject(new DOMException("Search cancelled.", "AbortError"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      this.#pending.add(pending);
      this.#next();
    });
  }

  clear(error: Error) {
    for (const pending of this.#pending) pending.reject(error);
    this.#pending.clear();
  }

  #next() {
    if (this.#running) return;
    const pending = this.#pending.values().next().value;
    if (!pending) return;
    this.#pending.delete(pending);
    pending.start();
  }
}
