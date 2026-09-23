import { DeckMetadataForm } from "./decks/deck-metadata-form";
import { deckFormats } from "@mooligan/domain/decks";
import { ResultsLayout } from "@/components/results-layout";
import { useState } from "react";
import { router } from "expo-router";
import { Button, Choice, Copy, Field, Panel, Row, Screen } from "@/components/ui";
import { useWorkspace } from "@/workspace/provider";

export default function DecksScreen() {
  const { decks, deckActions } = useWorkspace();
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [archive, setArchive] = useState("active");
  const [sort, setSort] = useState("recent");
  const [creating, setCreating] = useState(false);
  const visible = decks
    .filter(
      (d) =>
        (archive === "all" || d.archived === (archive === "archived")) &&
        (format === "all" || d.formatId === format) &&
        `${d.name} ${d.tags.join(" ")} ${d.notes}`.toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name) : b.updatedAt.localeCompare(a.updatedAt),
    );
  return (
    <Screen>
      <Copy title="Built for your next game.">
        {decks.filter((d) => !d.archived).length} active decks
      </Copy>
      <Button
        label={creating ? "Cancel new deck" : "Create deck"}
        onPress={() => setCreating(!creating)}
      />
      {creating && (
        <DeckMetadataForm
          submit="Create deck"
          onSave={(metadata) => {
            const id = deckActions.create(metadata);
            setCreating(false);
            router.push({ pathname: "/decks/[deckId]", params: { deckId: id } });
          }}
        />
      )}
      <Field
        label="Search decks"
        placeholder="Name, tag, or notes"
        value={query}
        onChangeText={setQuery}
      />
      <Choice
        label="Format"
        value={format}
        options={[
          { value: "all", label: "All formats" },
          ...deckFormats.map((value) => ({ value, label: value })),
        ]}
        onChange={setFormat}
      />
      <Row>
        <Choice
          label="Status"
          value={archive}
          options={[
            { value: "active", label: "Active" },
            { value: "archived", label: "Archived" },
            { value: "all", label: "All decks" },
          ]}
          onChange={setArchive}
        />
        <Choice
          label="Sort"
          value={sort}
          options={[
            { value: "recent", label: "Recently updated" },
            { value: "name", label: "Name" },
          ]}
          onChange={setSort}
        />
      </Row>
      <ResultsLayout preference="decks">
        {visible.map((deck) => (
          <Panel key={deck.id}>
            <Copy title={deck.name}>
              {deck.formatId} ·{" "}
              {deck.entries
                .filter((e) => e.section !== "maybeboard")
                .reduce((n, e) => n + e.quantity, 0)}{" "}
              cards{deck.archived ? " · archived" : ""}
              {deck.tags.length ? `\n${deck.tags.join(" · ")}` : ""}
            </Copy>
            <Button
              quiet
              label="Open deck"
              onPress={() =>
                router.push({ pathname: "/decks/[deckId]", params: { deckId: deck.id } })
              }
            />
          </Panel>
        ))}
      </ResultsLayout>
      {!visible.length && <Copy>No decks match. Create a deck to start adding cards.</Copy>}
    </Screen>
  );
}
