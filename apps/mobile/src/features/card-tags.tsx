import { useState } from "react";
import { Text, View } from "react-native";
import { starterCategories, type CardTag, type TagStyle } from "@mooligan/workspace/tag-contract";
import { tagColorStyles, tagColors } from "@mooligan/domain/tags";
import { tagsForDeck } from "@mooligan/workspace/client/tag-state";
import { Button, Choice, Copy, Field, Panel, Row, confirmRemoval } from "@/components/ui";
import { useWorkspace } from "@/workspace/provider";
import { useMooliganTheme } from "@/theme/theme-provider";

export function CardTagBadges({ tags }: { tags: readonly CardTag[] }) {
  const { palette } = useMooliganTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {tags.map((tag) => (
        <Text
          key={tag.id}
          style={{
            color: palette.text,
            borderLeftWidth: 3,
            borderLeftColor: tagColorStyles[tag.color].hex,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: palette.background,
            borderRadius: 4,
          }}
        >
          {tag.name}
          {tag.deckId === null ? " · Global" : ""}
        </Text>
      ))}
    </View>
  );
}

export function CardTagEditor({
  deckId,
  cardIds,
  title,
  onDone,
}: {
  deckId: string;
  cardIds: readonly string[];
  title: string;
  onDone: () => void;
}) {
  const { cardTags, tagAssignments, tagActions } = useWorkspace();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("deck");
  const tags = tagsForDeck(cardTags, deckId);
  const ids = new Set(cardIds);
  return (
    <Panel>
      <Copy title={title}>
        Changes save immediately. Global tags follow the card across all of your decks.
      </Copy>
      <Field
        label="Find or create a card tag"
        value={query}
        onChangeText={setQuery}
        maxLength={80}
      />
      {tags
        .filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()))
        .map((tag) => {
          const count = tagAssignments.filter(
            ({ tagId, cardId }) => tagId === tag.id && ids.has(cardId),
          ).length;
          return (
            <Button
              key={tag.id}
              quiet
              label={`${count === ids.size ? "✓ " : count > 0 ? "− " : ""}${tag.name}${tag.deckId === null ? " · Global" : ""}${ids.size > 1 ? ` · ${count}/${ids.size}` : ""}`}
              onPress={() => tagActions.assign(tag.id, cardIds, count !== ids.size)}
            />
          );
        })}
      <Choice
        label="New tag scope"
        value={scope}
        onChange={setScope}
        options={[
          { value: "deck", label: "This deck" },
          { value: "global", label: "Global" },
        ]}
      />
      <Button
        label="Create and apply"
        disabled={
          !query.trim() ||
          tags.some(
            (tag) =>
              tag.deckId === (scope === "global" ? null : deckId) &&
              tag.name.toLowerCase() === query.trim().toLowerCase(),
          )
        }
        onPress={() => {
          const id = tagActions.create(scope === "global" ? null : deckId, {
            name: query,
            color: "sage",
          });
          tagActions.assign(id, cardIds, true);
          setQuery("");
        }}
      />
      <Button quiet label="Done tagging" onPress={onDone} />
    </Panel>
  );
}

export function CardTagManager({ deckId }: { deckId: string }) {
  const { cardTags, tagAssignments, tagTemplates, tagActions } = useWorkspace();
  const [scope, setScope] = useState("deck");
  const [editing, setEditing] = useState<CardTag | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  const local = tagsForDeck(cardTags, deckId, false);
  const tags =
    scope === "deck" ? local : tagsForDeck(cardTags, deckId).filter((tag) => tag.deckId === null);
  const categories = local.map(({ name, color }) => ({ name, color }));
  return (
    <>
      <Copy title="Tags & categories">
        Deck categories organize cards by role. Global tags apply across your workspace. Templates
        reuse category names and colors.
      </Copy>
      <Choice
        label="Manage"
        value={scope}
        onChange={(scope) => {
          setScope(scope);
          setEditing(null);
        }}
        options={[
          { value: "deck", label: "This deck" },
          { value: "global", label: "Global" },
          { value: "templates", label: "Templates" },
        ]}
      />
      {scope !== "templates" ? (
        <>
          <TagDefinitionForm
            key={editing?.id ?? scope}
            tag={editing}
            onSave={(style) => {
              if (editing) tagActions.update(editing.id, style);
              else tagActions.create(scope === "global" ? null : deckId, style);
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
          {scope === "deck" && !local.length ? (
            <Button
              quiet
              label="Add starter categories"
              onPress={() => {
                tagActions.applyCategories(deckId, starterCategories);
              }}
            />
          ) : null}
          {tags.map((tag) => (
            <Panel key={tag.id}>
              <CardTagBadges tags={[tag]} />
              <Copy>
                {tagAssignments.filter(({ tagId }) => tagId === tag.id).length} tagged cards
              </Copy>
              <Row>
                <Button quiet label="Edit tag" onPress={() => setEditing(tag)} />
                <Button
                  quiet
                  destructive
                  label="Delete tag"
                  onPress={() =>
                    confirmRemoval(
                      `Delete ${tag.name}?`,
                      `Removes this tag and its assignments ${tag.deckId === null ? "across all decks" : "in this deck"}. Cards stay in your decks.`,
                      () => tagActions.remove(tag.id),
                    )
                  }
                />
              </Row>
            </Panel>
          ))}
        </>
      ) : (
        <>
          <Panel>
            <Field
              label="Template name"
              value={templateName}
              onChangeText={setTemplateName}
              maxLength={80}
            />
            <Button
              label={`Save ${local.length} deck categories as template`}
              disabled={!local.length || !templateName.trim()}
              onPress={() => {
                tagActions.saveTemplate(templateName, categories);
                setTemplateName("");
                setNotice("Template saved.");
              }}
            />
            {!local.length ? <Copy>Create categories in This deck first.</Copy> : null}
          </Panel>
          {tagTemplates.map((template) => (
            <Panel key={template.id}>
              <Copy title={template.name}>
                {template.categories.map(({ name }) => name).join(" · ")}
              </Copy>
              <Button
                label="Apply to deck"
                onPress={() => {
                  const count = tagActions.applyTemplate(deckId, template.id);
                  setNotice(
                    count
                      ? `Added ${count} categories.`
                      : "All template categories are already in this deck.",
                  );
                }}
              />
              <Button
                quiet
                label="Update from deck"
                disabled={!local.length}
                onPress={() => {
                  tagActions.saveTemplate(template.name, categories, template.id);
                  setNotice("Template updated.");
                }}
              />
              <Button
                quiet
                destructive
                label="Delete template"
                onPress={() =>
                  confirmRemoval(
                    `Delete ${template.name}?`,
                    "Deck categories stay unchanged.",
                    () => tagActions.removeTemplate(template.id),
                  )
                }
              />
            </Panel>
          ))}
          {!tagTemplates.length ? <Copy>Your saved templates will appear here.</Copy> : null}
        </>
      )}
      {notice ? <Copy>{notice}</Copy> : null}
    </>
  );
}

function TagDefinitionForm({
  tag,
  onSave,
  onCancel,
}: {
  tag: CardTag | null;
  onSave: (style: TagStyle) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState<TagStyle["color"]>(tag?.color ?? "sage");
  return (
    <Panel>
      <Field label="Tag name" value={name} onChangeText={setName} maxLength={80} />
      <Choice
        label="Color"
        value={color}
        onChange={setColor}
        options={tagColors.map((value) => ({ value, label: tagColorStyles[value].label }))}
      />
      <Button
        label={tag ? "Save tag" : "Create tag"}
        disabled={!name.trim()}
        onPress={() => {
          onSave({ name, color });
          setName("");
        }}
      />
      {tag ? <Button quiet label="Cancel" onPress={onCancel} /> : null}
    </Panel>
  );
}
