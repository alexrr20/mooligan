import { useState } from "react";
import type { CatalogCardDetail } from "@mooligan/domain/catalog-detail";
import type { Finish } from "@mooligan/domain/catalog";
import type { DeckSection } from "@mooligan/domain/decks";
import { Button, Choice, Copy, Field, Panel } from "@/components/ui";
import { useWorkspace } from "@/workspace/provider";
import { deckSectionOptions, finishOptions } from "../options";

export function AddDeckCard({
  detail,
  deckId,
  onDone,
}: {
  detail: CatalogCardDetail;
  deckId?: string;
  onDone?: () => void;
}) {
  const { decks, deckActions } = useWorkspace();
  const [selectedDeck, setSelectedDeck] = useState(
    deckId ?? decks.find((d) => !d.archived)?.id ?? "",
  );
  const [section, setSection] = useState<DeckSection>("mainboard");
  const [finish, setFinish] = useState<Finish>(detail.selectedPrinting.finishes?.[0] ?? "nonfoil");
  const [quantity, setQuantity] = useState("1");
  const [saved, setSaved] = useState(false);
  return (
    <Panel>
      {!deckId && (
        <Choice
          label="Deck"
          value={selectedDeck}
          options={decks.filter((d) => !d.archived).map((d) => ({ label: d.name, value: d.id }))}
          onChange={setSelectedDeck}
        />
      )}
      {!selectedDeck && <Copy>Create a deck in the Decks tab first.</Copy>}
      <Field
        label="Quantity"
        value={quantity}
        onChangeText={setQuantity}
        keyboardType="number-pad"
      />
      <Choice label="Section" value={section} options={deckSectionOptions} onChange={setSection} />
      <Choice
        label="Finish"
        value={finish}
        options={finishOptions.filter((f) => detail.selectedPrinting.finishes?.includes(f.value))}
        onChange={setFinish}
      />
      <Button
        label="Add to deck"
        disabled={!selectedDeck}
        onPress={async () => {
          await deckActions.add(selectedDeck, {
            printingId: detail.selectedPrinting.id,
            finish,
            quantity: Number(quantity),
            section,
          });
          setSaved(true);
          onDone?.();
        }}
      />
      {saved && <Copy>Added to your deck.</Copy>}
    </Panel>
  );
}
