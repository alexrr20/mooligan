import type { HistoryState } from "@tanstack/react-router";
import { StrictStruct, type JsonValue } from "@mooligan/domain/schema";
import { Option, Schema } from "effect";

const DeckOriginSchema = StrictStruct({
  deckId: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128)),
});
export type DeckOrigin = typeof DeckOriginSchema.Type;

export function readDeckOrigin(state: HistoryState | JsonValue): DeckOrigin | null {
  const parsed = Schema.decodeUnknownOption(Schema.Struct({ deckOrigin: DeckOriginSchema }))(state);
  return Option.isSome(parsed) ? parsed.value.deckOrigin : null;
}

export function withDeckOrigin(origin: DeckOrigin) {
  const deckOrigin = Schema.decodeUnknownSync(DeckOriginSchema)(origin);
  return (current: HistoryState): HistoryState & { deckOrigin: DeckOrigin } => {
    const state = Object.fromEntries(
      Object.entries(current).filter(
        ([key]) => key !== "collectionOrigin" && key !== "catalogSearchOrigin",
      ),
    );
    return { ...state, deckOrigin };
  };
}
