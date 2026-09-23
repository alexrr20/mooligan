import { Button, Copy, Panel } from "@/components/ui";
import { useWorkspace } from "@/workspace/provider";

export function CatalogSetup() {
  const { reference, snapshot, busy, progress, error } = useWorkspace();
  return (
    <Panel>
      <Copy title={snapshot ? "Offline catalog" : "Bring your cards offline"}>
        {snapshot
          ? `${snapshot.cardCount.toLocaleString()} printings · ${snapshot.updatedAt.slice(0, 10)}`
          : "Download the card catalog once to search cards, build decks, and manage your collection without a connection. Card images are saved as you view them."}
      </Copy>
      {progress && <Copy>{progress}</Copy>}
      {error && <Copy>{error}</Copy>}
      <Button
        disabled={busy}
        label={snapshot ? "Update catalog" : "Download card catalog"}
        onPress={() => reference.updateCatalog()}
      />
    </Panel>
  );
}
