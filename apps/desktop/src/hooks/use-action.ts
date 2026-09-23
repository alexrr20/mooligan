import { useState } from "react";

/** Report errors from synchronous workspace commits in the current view. */
export function useAction() {
  const [error, setError] = useState<Error | null>(null);
  return {
    error,
    clearError: () => setError(null),
    run(action: () => void) {
      try {
        action();
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      }
    },
  };
}
