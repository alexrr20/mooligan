import { useState } from "react";
import { router } from "expo-router";
import { Button, Copy, Panel, Row, Screen } from "@/components/ui";
import { CardRow } from "@/components/cards";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";

export default function SetsScreen() {
  const { spoiler, visibility } = useWorkspace();
  const [offset, setOffset] = useState(0);
  const releases = useCatalogQuery(["releases"], ({ catalog, visibility }) =>
    catalog.upcoming(visibility),
  );
  const printings = useCatalogQuery(["previews", offset], ({ catalog, visibility }) =>
    catalog.upcomingPrintings({ offset, limit: 40 }, visibility),
  );
  return (
    <Screen>
      <Copy title="On the horizon">Choose which upcoming releases you want to see.</Copy>
      {releases.error && <Copy>{releases.error.message}</Copy>}
      {releases.data?.map((release) => (
        <Panel key={release.rootSetId}>
          <Copy title={release.name}>
            {release.code.toUpperCase()} · {release.nextReleaseOn}
          </Copy>
          <Button
            quiet
            label={
              visibility.revealedRootSetIds.includes(release.rootSetId)
                ? "Protect release family"
                : "Reveal release family"
            }
            onPress={() =>
              spoiler({
                type: visibility.revealedRootSetIds.includes(release.rootSetId)
                  ? "protect-release"
                  : "reveal-release",
                targetId: release.rootSetId,
              })
            }
          />
        </Panel>
      ))}
      {printings.error && <Copy>{printings.error.message}</Copy>}
      {printings.data?.printings.map((preview) =>
        preview.status === "visible" ? (
          <CardRow
            key={preview.card.id}
            printingId={preview.card.id}
            name={preview.card.name}
            detail={`${preview.release.name} · ${preview.releasedOn}`}
            image={preview.card.image}
          />
        ) : (
          <Panel key={preview.printingId}>
            <Copy title="Protected preview">
              {preview.release.name} · {preview.releasedOn}
            </Copy>
            <Button
              quiet
              label="Preview controls"
              onPress={() =>
                router.push({
                  pathname: "/cards/[printingId]",
                  params: { printingId: preview.printingId },
                })
              }
            />
          </Panel>
        ),
      )}
      {printings.data?.total === 0 && <Copy>No upcoming printings in this catalog.</Copy>}
      <Row>
        <Button quiet label="Previous" disabled={!offset} onPress={() => setOffset(offset - 40)} />
        <Button
          quiet
          label="Next"
          disabled={!printings.data?.hasMore}
          onPress={() => setOffset(offset + 40)}
        />
      </Row>
    </Screen>
  );
}
