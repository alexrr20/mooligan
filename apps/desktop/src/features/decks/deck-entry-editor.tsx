import { EditorSelect, EditorMessage, editorStyles } from "../../components/ui/editor-controls";
import type { DeckEntry } from "@mooligan/workspace/deck-contract";
import type { DeckSection } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Form } from "../../components/ui/form";
import { useCatalogCardDetail } from "../cards/use-card-detail";
import { DeckQuantity, deckSectionOptions } from "./deck-controls";
import { useDeckMutations } from "./use-decks";

export function DeckEntryEditor({
  deckId,
  entry,
  onClose,
}: {
  deckId: string;
  entry: DeckEntry;
  onClose: () => void;
}) {
  const [original] = useState(entry);
  const [printingId, setPrintingId] = useState(entry.printingId);
  const [finish, setFinish] = useState(entry.finish);
  const [section, setSection] = useState<DeckSection>(entry.section);
  const [quantity, setQuantity] = useState(entry.quantity);
  const card = useCatalogCardDetail(printingId);
  const detail = card.result?.status === "visible" ? card.result.detail : null;
  const printings = detail?.siblingPrintings.length
    ? detail.siblingPrintings
    : detail
      ? [detail.selectedPrinting]
      : [];
  const finishes = detail?.selectedPrinting.finishes ?? [original.finish];
  const mutations = useDeckMutations();
  const save = useMutation({
    mutationFn: async () => {
      await mutations.updateEntry(deckId, original.id, {
        ...(quantity !== original.quantity && { quantity }),
        ...(section !== original.section && { section }),
        ...(finish !== original.finish && { finish }),
        ...(printingId !== original.printingId && { printingId }),
      });
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent style={editorStyles.dialog}>
        <DialogTitle>Edit deck card</DialogTitle>
        <DialogDescription>
          {detail?.card.name ??
            "Printing details are unavailable. You can still change its quantity or section."}
        </DialogDescription>
        <Form
          style={editorStyles.fields}
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          {printings.length ? (
            <EditorSelect
              label="Printing"
              options={printings.map((printing) => ({
                value: printing.id,
                label: `${printing.setName} · ${printing.setCode.toUpperCase()} ${printing.collectorNumber}`,
              }))}
              value={printingId}
              onChange={setPrintingId}
              disabled={save.isPending}
            />
          ) : null}
          <EditorSelect
            label="Finish"
            options={[...new Set([...finishes, finish])].map((value) => ({ label: value, value }))}
            value={finish}
            onChange={setFinish}
            disabled={!detail || save.isPending}
          />
          {!finishes.includes(finish) ? (
            <EditorMessage error>Choose a finish supported by this printing.</EditorMessage>
          ) : null}
          <EditorSelect
            label="Section"
            options={deckSectionOptions}
            value={section}
            onChange={setSection}
            disabled={save.isPending}
          />
          <DeckQuantity value={quantity} onChange={setQuantity} disabled={save.isPending} />
          {save.error ? <EditorMessage error>{save.error.message}</EditorMessage> : null}
          <div {...stylex.props(editorStyles.toolbar)}>
            <Button
              type="submit"
              disabled={
                save.isPending ||
                !finishes.includes(finish) ||
                (printingId !== original.printingId && !detail)
              }
            >
              Save card
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
