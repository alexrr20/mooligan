import { useState } from "react";
import { Schema } from "effect";
import {
  workspaceBackupMaxBytes,
  workspaceBackupSchema,
  type WorkspaceBackup,
} from "@mooligan/workspace/backup";
import {
  createWorkspaceBackup,
  restoreWorkspaceBackup,
} from "@mooligan/workspace/client/workspace-backup";
import { events } from "@mooligan/workspace/schema";
import { priceCurrencies, priceProviderLabels, priceProviders } from "@mooligan/domain/market";
import { Button, Choice, Copy, Panel, Row } from "@/components/ui";
import { useMobileAccount } from "@/account/account-provider";
import { useCatalogQuery, useWorkspace } from "@/workspace/provider";
import { readDocument, shareDocument } from "@/workspace/files";
import { CatalogSetup } from "./search";

export function WorkspaceSettings() {
  const { account } = useMobileAccount();
  const {
    store,
    spoiler,
    visibility,
    currency,
    providers,
    reference,
    prices,
    busy,
    progress,
    error,
  } = useWorkspace();
  const [backup, setBackup] = useState<WorkspaceBackup | null>(null);
  const reveals = useCatalogQuery(["reveals"], ({ catalog, visibility }) =>
    catalog.reveals(visibility.revealedPrintingIds, visibility.revealedRootSetIds),
  );
  return (
    <>
      <CatalogSetup />
      <Panel>
        <Copy title="Spoiler protection">Preview choices sync with your workspace.</Copy>
        <Choice
          label="Upcoming printings"
          value={visibility.policy}
          options={[
            { value: "protect", label: "Protect unreleased printings" },
            { value: "show", label: "Always show previews" },
          ]}
          onChange={(policy) => void spoiler({ type: "set-policy", policy })}
        />
        <Button
          quiet
          label="Protect all previews and reset reveals"
          onPress={() => spoiler({ type: "protect-all" })}
        />
        {[...(reveals.data?.printings ?? []), ...(reveals.data?.releases ?? [])].map((reveal) => (
          <Row key={`${reveal.scope}-${reveal.targetId}`}>
            <Copy>{reveal.label}</Copy>
            <Button
              quiet
              label="Protect"
              onPress={() =>
                spoiler({
                  type: reveal.scope === "printing" ? "protect-printing" : "protect-release",
                  targetId: reveal.targetId,
                })
              }
            />
          </Row>
        ))}
      </Panel>
      <Panel>
        <Copy title="Card prices">
          {prices
            ? `Saved prices from ${prices.date}`
            : "Download daily reference prices to view them offline. The first download also includes a large printing identifier file."}
        </Copy>
        <Choice
          label="Default currency"
          value={currency}
          options={priceCurrencies.map((value) => ({ label: value, value }))}
          onChange={(currency) => store.commit(events.priceCurrencyChanged({ currency }))}
        />
        {priceProviders.map((provider) => (
          <Choice
            key={provider}
            label={priceProviderLabels[provider]}
            value={providers.includes(provider) ? "enabled" : "disabled"}
            options={[
              { value: "enabled", label: "Enabled" },
              { value: "disabled", label: "Disabled" },
            ]}
            onChange={(value) =>
              store.commit(
                events.priceProviderChanged({
                  provider,
                  enabled: value === "enabled",
                }),
              )
            }
          />
        ))}
        {progress && <Copy>{progress}</Copy>}
        {error && <Copy>{error}</Copy>}
        <Button
          quiet
          label="Update market prices"
          disabled={busy}
          onPress={() => reference.updatePrices()}
        />
      </Panel>
      <Panel>
        <Copy title="Workspace backup">
          Keep your collection, decks, profile, price preferences, and spoiler decisions in a file.
          Import creates a separate local workspace and retains the one you have open.
        </Copy>
        <Button
          label="Export backup"
          onPress={() =>
            shareDocument(
              "mooligan-workspace.json",
              JSON.stringify(
                Schema.decodeUnknownSync(workspaceBackupSchema)(createWorkspaceBackup(store)),
              ),
              "application/json",
            )
          }
        />
        <Button
          quiet
          label="Choose backup to import"
          onPress={async () => {
            const text = await readDocument(workspaceBackupMaxBytes);
            if (text !== null)
              setBackup(Schema.decodeUnknownSync(workspaceBackupSchema)(JSON.parse(text)));
          }}
        />
        {backup && (
          <>
            <Copy title="Restore this backup?">
              {backup.collectionLots.reduce((sum, lot) => sum + lot.quantity, 0)} copies ·{" "}
              {backup.decks.length} decks. The restored workspace starts without account sync.
            </Copy>
            <Row>
              <Button quiet label="Cancel" onPress={() => setBackup(null)} />
              <Button
                label="Restore as new workspace"
                onPress={async () => {
                  await account.restoreWorkspace((workspace) =>
                    restoreWorkspaceBackup(workspace.store, backup),
                  );
                  setBackup(null);
                }}
              />
            </Row>
          </>
        )}
      </Panel>
    </>
  );
}
