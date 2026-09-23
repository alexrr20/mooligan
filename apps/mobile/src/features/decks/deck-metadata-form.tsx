import { useState } from "react";
import { deckFormats } from "@mooligan/domain/decks";
import type { DeckMetadata } from "@mooligan/workspace/deck-contract";
import { Button, Choice, Field, Panel } from "@/components/ui";

export function DeckMetadataForm({
  initial,
  submit,
  onSave,
}: {
  initial?: DeckMetadata;
  submit: string;
  onSave: (metadata: DeckMetadata, original?: DeckMetadata) => void;
}) {
  const [original] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [formatId, setFormat] = useState(initial?.formatId ?? "casual");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [tags, setTags] = useState(initial?.tags.join(", ") ?? "");
  return (
    <Panel>
      <Field label="Deck name" value={name} onChangeText={setName} maxLength={200} />
      <Choice
        label="Format"
        value={formatId}
        options={[...new Set([...deckFormats, formatId])].map((value) => ({ value, label: value }))}
        onChange={setFormat}
      />
      <Field label="Deck labels, separated by commas" value={tags} onChangeText={setTags} />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <Button
        label={submit}
        onPress={() =>
          onSave(
            {
              name,
              formatId,
              notes,
              tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
              archived: original?.archived ?? false,
            },
            original,
          )
        }
      />
    </Panel>
  );
}
