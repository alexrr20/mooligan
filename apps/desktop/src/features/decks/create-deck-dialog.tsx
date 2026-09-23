import type { DeckMetadata } from "@mooligan/workspace/deck-contract";
import { useNavigate } from "@tanstack/react-router";

import { DeckMetadataEditor } from "./deck-metadata-editor";
import { useDeckMutations } from "./use-decks";

const emptyDeck: DeckMetadata = {
  name: "",
  formatId: "casual",
  notes: "",
  tags: [],
  archived: false,
};

export function CreateDeckDialog({ onClose }: { onClose: () => void }) {
  const mutations = useDeckMutations();
  const navigate = useNavigate();
  return (
    <DeckMetadataEditor
      title="Create deck"
      chooseCommander
      initial={emptyDeck}
      onClose={onClose}
      onSave={(metadata, _changed, entries) => {
        const id = mutations.create(metadata, entries);
        onClose();
        void navigate({ to: "/decks", search: { deck: id } });
      }}
    />
  );
}
