import type { Deck } from "@mooligan/workspace/deck-contract";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useState, type RefObject } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { DeckMessage, deckStyles } from "./deck-controls";
import { exportDeckText, resolveDeckText } from "@mooligan/workspace/client/deck-transfer";
import { useDeckMutations } from "./use-decks";

export function DeckImportExport({
  finalFocus,
  deck,
  mode,
  printings,
  onClose,
}: {
  finalFocus: RefObject<HTMLElement | null>;
  deck: Deck;
  mode: "import" | "export";
  printings: ReadonlyMap<string, CatalogPrintingResult | null>;
  onClose: () => void;
}) {
  const mutations = useDeckMutations();
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const exported = exportDeckText(deck.entries, printings);
  const preview = useMutation({ mutationFn: () => resolveDeckText(text, window.catalog) });
  const apply = useMutation({
    mutationFn: async () => {
      if (!preview.data || preview.data.errors.length) return;
      mutations.addEntries(deck.id, preview.data.entries);
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !preview.isPending) onClose();
      }}
    >
      <DialogContent finalFocus={finalFocus} style={deckStyles.dialog}>
        <DialogTitle>{mode === "import" ? "Import cards" : "Export deck"}</DialogTitle>
        <DialogDescription>
          {mode === "import"
            ? "Paste a deck list with quantities and section headings. Imported cards are added to the deck."
            : "This list includes exact printing and finish references. Use a workspace backup to preserve card tags and templates."}
        </DialogDescription>
        <label {...stylex.props(deckStyles.field)}>
          {mode === "import" ? "Deck list" : "Exported deck list"}
          <textarea
            {...stylex.props(deckStyles.textarea)}
            rows={12}
            value={mode === "import" ? text : exported}
            readOnly={mode === "export"}
            disabled={preview.isPending}
            maxLength={1_000_000}
            onChange={(event) => {
              setText(event.target.value);
              preview.reset();
              apply.reset();
            }}
          />
        </label>
        {mode === "import" ? (
          <>
            <p {...stylex.props(deckStyles.muted)}>
              For example: 4 Lightning Bolt. Optional edition: 4 Lightning Bolt (M11) 146. Supported
              sections: main deck, sideboard, commander, companion, maybeboard.
            </p>
            {preview.error || apply.error ? (
              <DeckMessage error>{(preview.error ?? apply.error)?.message}</DeckMessage>
            ) : null}
            {preview.data ? (
              <>
                <DeckMessage>
                  {preview.data.entries.reduce((total, entry) => total + entry.quantity, 0)} copies
                  resolved.
                </DeckMessage>
                {preview.data.errors.map((error) => (
                  <DeckMessage key={error} error>
                    {error}
                  </DeckMessage>
                ))}
                {preview.data.warnings.map((warning) => (
                  <DeckMessage key={warning}>{warning}</DeckMessage>
                ))}
              </>
            ) : null}
            <div {...stylex.props(deckStyles.toolbar)}>
              <Button disabled={!text.trim() || preview.isPending} onClick={() => preview.mutate()}>
                {preview.isPending ? "Reading local catalog…" : "Check import"}
              </Button>
              <Button
                disabled={
                  !preview.data?.entries.length ||
                  !!preview.data.errors.length ||
                  apply.isPending ||
                  preview.isPending
                }
                onClick={() => apply.mutate()}
              >
                Add cards to deck
              </Button>
            </div>
          </>
        ) : (
          <div {...stylex.props(deckStyles.toolbar)}>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(exported).then(
                  () => setMessage("Copied deck list."),
                  () => setMessage("Copy failed. Select and copy the text above."),
                );
              }}
            >
              Copy list
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([exported], { type: "text/plain;charset=utf-8" }),
                );
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `${deck.name.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 100) || "deck"}.txt`;
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              Save text file
            </Button>
            {message ? <DeckMessage>{message}</DeckMessage> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
