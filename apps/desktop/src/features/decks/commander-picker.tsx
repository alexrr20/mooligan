import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";

import { Button } from "../../components/ui/button";
import { DeckCardSearch } from "./deck-card-picker";
import { DeckMessage, deckStyles } from "./deck-controls";

export function CommanderPicker({
  value,
  onChange,
  onPendingChange,
}: {
  value: CatalogCardDetail | undefined;
  onChange: (value: CatalogCardDetail | undefined) => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const selection = useMutation({
    mutationFn: async (printingId: string) => {
      const result = await window.catalog.detail(printingId);
      if (!result || result.status !== "visible")
        throw new Error("This printing is unavailable or protected.");
      if (!result.detail.selectedPrinting.finishes?.length)
        throw new Error("This printing has no available finishes.");
      return result.detail;
    },
  });
  return (
    <section {...stylex.props(deckStyles.field)} aria-label="Commander">
      <span>Commander</span>
      {value ? (
        <div {...stylex.props(deckStyles.row)}>
          <div {...stylex.props(deckStyles.grow)}>
            <strong>{value.card.name}</strong>
            <p {...stylex.props(deckStyles.muted)}>
              {value.selectedPrinting.setCode.toUpperCase()}{" "}
              {value.selectedPrinting.collectorNumber}
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => onChange(undefined)}>
            Remove commander
          </Button>
        </div>
      ) : (
        <DeckCardSearch
          actionLabel="Choose commander"
          disabled={selection.isPending}
          onSelect={(id) => {
            onPendingChange(true);
            selection.mutate(id, {
              onSuccess: onChange,
              onSettled: () => onPendingChange(false),
            });
          }}
        />
      )}
      {selection.isPending ? <DeckMessage>Reading printing…</DeckMessage> : null}
      {selection.error ? <DeckMessage error>{selection.error.message}</DeckMessage> : null}
    </section>
  );
}
