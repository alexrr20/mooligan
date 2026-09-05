import type { HistoryState } from "@tanstack/react-router";
import * as z from "zod";
import type { JSONType } from "zod";

const DeckOriginSchema = z.strictObject({ deckId: z.string().min(1).max(128) });
export type DeckOrigin = z.infer<typeof DeckOriginSchema>;

export function readDeckOrigin(state: HistoryState | JSONType): DeckOrigin | null {
  const parsed = z.object({ deckOrigin: DeckOriginSchema }).safeParse(state);
  return parsed.success ? parsed.data.deckOrigin : null;
}

export function withDeckOrigin(origin: DeckOrigin) {
  const deckOrigin = DeckOriginSchema.parse(origin);
  return (current: HistoryState): HistoryState & { deckOrigin: DeckOrigin } => {
    const state = Object.fromEntries(
      Object.entries(current).filter(
        ([key]) => key !== "collectionOrigin" && key !== "catalogSearchOrigin",
      ),
    );
    return { ...state, deckOrigin };
  };
}
