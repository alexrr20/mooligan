import type { HistoryState } from "@tanstack/react-router";
import { StrictStruct, type JsonValue } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";
import { CollectionSearchStateSchema } from "../collection/collection-state.ts";
import { CatalogSearchStateSchema } from "../search/search-state.ts";

const CardDetailOriginSchema = Schema.Union(
  StrictStruct({
    kind: Schema.Literal("deck"),
    deckId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
  }),
  StrictStruct({ kind: Schema.Literal("collection"), search: CollectionSearchStateSchema }),
  StrictStruct({ kind: Schema.Literal("search"), search: CatalogSearchStateSchema }),
);
export type CardDetailOrigin = typeof CardDetailOriginSchema.Type;
export type CollectionOrigin = Extract<CardDetailOrigin, { kind: "collection" }>;
export type CatalogSearchOrigin = Extract<CardDetailOrigin, { kind: "search" }>;

const HistoryOriginSchema = Schema.Struct({ origin: CardDetailOriginSchema });

export function readCardDetailOrigin(state: HistoryState | JsonValue): CardDetailOrigin | null {
  return Option.getOrNull(
    Option.map(Schema.decodeUnknownOption(HistoryOriginSchema)(state), (value) => value.origin),
  );
}

export function withCardDetailOrigin(origin: CardDetailOrigin | null) {
  const validated =
    origin === null ? null : Schema.decodeUnknownSync(CardDetailOriginSchema)(origin);
  return (
    current: HistoryState & { origin?: JsonValue },
  ): HistoryState & { origin?: CardDetailOrigin } => {
    const { origin: _origin, ...state } = current;
    return validated === null ? state : { ...state, origin: validated };
  };
}
