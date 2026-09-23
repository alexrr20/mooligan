import { type JsonValue, JsonValueSchema } from "@mooligan/domain/schema";
import { Schema } from "effect";

const decodeCatalogRequestResponse = Schema.decodeUnknownSync(
  Schema.Union(
    Schema.Struct({ status: Schema.Literal("completed"), result: JsonValueSchema }),
    Schema.Struct({ status: Schema.Literal("cancelled") }),
  ),
);

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

export function unwrapCatalogRequest(value: JsonValue) {
  const response = decodeCatalogRequestResponse(value);
  if (response.status === "cancelled") {
    // Electron's context bridge preserves Error messages, but does not clone DOMException.
    const error = new Error("Search cancelled.");
    error.name = "AbortError";
    throw error;
  }
  return response.result;
}
