import * as z from "zod";
import type { JSONType } from "zod";

const CatalogRequestResponseSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("completed"), result: z.json() }),
  z.object({ status: z.literal("cancelled") }),
]);

type CatalogRequestResponse<Result> =
  | { status: "completed"; result: Result }
  | { status: "cancelled" };

export async function settleCatalogRequest<Result>(
  read: () => Promise<Result>,
  signal?: AbortSignal,
): Promise<CatalogRequestResponse<Result>> {
  try {
    signal?.throwIfAborted();
    const result = await read();
    signal?.throwIfAborted();
    return { status: "completed", result } as const;
  } catch (error) {
    if (signal?.aborted && error instanceof Error && error.name === "AbortError") {
      return { status: "cancelled" } as const;
    }
    throw error;
  }
}

export function unwrapCatalogRequest(value: JSONType) {
  const response = CatalogRequestResponseSchema.parse(value);
  if (response.status === "cancelled") {
    // Electron's context bridge preserves Error messages, but does not clone DOMException.
    const error = new Error("Search cancelled.");
    error.name = "AbortError";
    throw error;
  }
  return response.result;
}
