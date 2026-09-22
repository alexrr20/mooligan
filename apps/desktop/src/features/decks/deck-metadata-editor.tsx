import { type CatalogCardDetail, getCatalogFormatName } from "@mooligan/domain/catalog-detail";
import { deckFormats, type DeckEntry, type DeckMetadata } from "@mooligan/domain/decks";
import * as stylex from "@stylexjs/stylex";
import { useState, type RefObject } from "react";

import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Form } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { CommanderPicker } from "./commander-picker";
import { DeckMessage, DeckSelect, deckStyles } from "./deck-controls";

export function DeckMetadataEditor({
  finalFocus,
  chooseCommander = false,
  initial,
  onSave,
  onClose,
  title,
}: {
  finalFocus?: RefObject<HTMLElement | null>;
  initial: DeckMetadata;
  chooseCommander?: boolean;
  onSave: (
    metadata: DeckMetadata,
    changed: Partial<DeckMetadata>,
    entries: Omit<DeckEntry, "id">[],
  ) => void;
  onClose: () => void;
  title: string;
}) {
  const [original] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [formatId, setFormatId] = useState(initial.formatId);
  const [notes, setNotes] = useState(initial.notes);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [commander, setCommander] = useState<CatalogCardDetail>();
  const [commanderPending, setCommanderPending] = useState(false);
  const hasCommander =
    chooseCommander &&
    ["commander", "brawl", "standardbrawl", "duel", "paupercommander", "oathbreaker"].includes(
      formatId,
    );
  const [error, setError] = useState("");
  const formats = [...new Set([...deckFormats, initial.formatId])].map((value) => ({
    value,
    label: getCatalogFormatName(value),
  }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent finalFocus={finalFocus} style={deckStyles.dialog}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>Save a planned deck in this workspace.</DialogDescription>
        <Form
          style={deckStyles.fields}
          onSubmit={(event) => {
            event.preventDefault();
            if (commanderPending) return;
            const metadata = {
              name: name.trim(),
              formatId,
              notes,
              tags: [
                ...new Set(
                  tags
                    .split(",")
                    .map((tag) => tag.trim())
                    .filter(Boolean),
                ),
              ],
              archived: original.archived,
            };
            const changed: Partial<DeckMetadata> = {};
            if (metadata.name !== original.name) changed.name = metadata.name;
            if (metadata.formatId !== original.formatId) changed.formatId = metadata.formatId;
            if (metadata.notes !== original.notes) changed.notes = metadata.notes;
            if (JSON.stringify(metadata.tags) !== JSON.stringify(original.tags))
              changed.tags = metadata.tags;
            try {
              const printing = hasCommander ? commander?.selectedPrinting : undefined;
              const finish =
                printing?.finishes?.find((value) => value === "nonfoil") ?? printing?.finishes?.[0];
              onSave(
                metadata,
                changed,
                printing && finish
                  ? [{ printingId: printing.id, finish, quantity: 1, section: "commander" }]
                  : [],
              );
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "The deck could not be saved.");
            }
          }}
        >
          <label {...stylex.props(deckStyles.field)}>
            Name
            <Input autoFocus required maxLength={200} value={name} onValueChange={setName} />
          </label>
          <DeckSelect
            label="Format"
            options={formats}
            value={formatId}
            onChange={(value) => {
              setFormatId(value);
              setCommander(undefined);
              setCommanderPending(false);
            }}
          />
          {hasCommander ? (
            <CommanderPicker
              key={formatId}
              value={commander}
              onChange={setCommander}
              onPendingChange={setCommanderPending}
            />
          ) : null}
          <label {...stylex.props(deckStyles.field)}>
            Deck labels, separated by commas
            <Input value={tags} onValueChange={setTags} />
          </label>
          <label {...stylex.props(deckStyles.field)}>
            Notes
            <textarea
              {...stylex.props(deckStyles.textarea)}
              value={notes}
              maxLength={50_000}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error ? <DeckMessage error>{error}</DeckMessage> : null}
          <div {...stylex.props(deckStyles.toolbar)}>
            <Button type="submit" disabled={!name.trim() || commanderPending}>
              Save deck
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
