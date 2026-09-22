import { Tabs } from "@base-ui/react/tabs";
import { starterCategories, tagColors, type CardTag, type TagStyle } from "@mooligan/domain/tags";
import { tagsForDeck } from "@mooligan/workspace/client/tag-state";
import * as stylex from "@stylexjs/stylex";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Form } from "../../components/ui/form";
import { Input } from "../../components/ui/input";
import { CardTagBadge, tagStyles } from "./card-tag-controls";
import { DeckMessage, DeckSelect, deckStyles } from "./deck-controls";
import { useCardTags } from "./use-card-tags";

export function CardTagManager({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const { tags, assignments, templates, actions } = useCardTags();
  const [tab, setTab] = useState("deck");
  const [editing, setEditing] = useState<CardTag | null>(null);
  const [removing, setRemoving] = useState<CardTag | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [notice, setNotice] = useState("");
  const action = useMutation({ mutationFn: async (run: () => void) => run() });
  const local = tagsForDeck(tags, deckId, false);
  const listed =
    tab === "global" ? tagsForDeck(tags, deckId).filter((tag) => tag.deckId === null) : local;
  const categories = local.map(({ name, color }) => ({ name, color }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent style={deckStyles.dialog}>
        <DialogTitle>Tags & categories</DialogTitle>
        <DialogDescription>
          Organize cards by what they do. Save your deck categories as a template to reuse in
          another deck.
        </DialogDescription>
        <Tabs.Root
          value={tab}
          onValueChange={(value) => {
            setTab(String(value));
            setEditing(null);
            setRemoving(null);
            setNotice("");
            action.reset();
          }}
        >
          <Tabs.List aria-label="Tag settings" {...stylex.props(styles.tabs)}>
            <Tabs.Tab value="deck" {...stylex.props(styles.tab)}>
              This deck <span>{local.length}</span>
            </Tabs.Tab>
            <Tabs.Tab value="global" {...stylex.props(styles.tab)}>
              Global
            </Tabs.Tab>
            <Tabs.Tab value="templates" {...stylex.props(styles.tab)}>
              Templates
            </Tabs.Tab>
          </Tabs.List>
          {["deck", "global"].map((scope) => (
            <Tabs.Panel key={scope} value={scope}>
              <div {...stylex.props(deckStyles.fields)}>
                <p {...stylex.props(tagStyles.caption)}>
                  {scope === "deck"
                    ? "These categories apply only to cards in this deck. Group by tags to see each role and its card count."
                    : "Global tags apply to a card in every deck in this workspace. Renaming or deleting one affects all of your decks."}
                </p>
                <TagDefinitionForm
                  key={editing?.id ?? scope}
                  tag={editing}
                  onSave={(style) => {
                    if (editing) actions.update(editing.id, style);
                    else actions.create(scope === "global" ? null : deckId, style);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
                {!listed.length ? (
                  <div {...stylex.props(styles.empty)}>
                    <p {...stylex.props(deckStyles.muted)}>
                      {scope === "deck"
                        ? "Make room for every role in your deck."
                        : "Tag a card once. Find its role in every deck."}
                    </p>
                    {scope === "deck" ? (
                      <Button
                        variant="secondary"
                        onClick={() =>
                          action.mutate(() => {
                            actions.applyCategories(deckId, starterCategories);
                            setNotice(
                              "Added six starter categories. Assign cards from the deck view.",
                            );
                          })
                        }
                      >
                        Add starter categories
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <div {...stylex.props(styles.rows)}>
                  {listed.map((tag) => (
                    <div key={tag.id} {...stylex.props(styles.row)}>
                      <div {...stylex.props(styles.identity)}>
                        <CardTagBadge tag={tag} />
                        <span {...stylex.props(tagStyles.caption)}>
                          {assignments.filter(({ tagId }) => tagId === tag.id).length} tagged cards
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        aria-label={`Edit ${tag.name} tag`}
                        onClick={() => {
                          setEditing(tag);
                          setRemoving(null);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Delete ${tag.name} tag`}
                        onClick={() => {
                          setRemoving(tag);
                          setEditing(null);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
                {removing ? (
                  <div {...stylex.props(styles.confirm)} role="alert">
                    <p>
                      Delete “{removing.name}” and its assignments{" "}
                      {removing.deckId === null ? "across all decks" : "in this deck"}? Cards stay
                      in your decks.
                    </p>
                    <div {...stylex.props(deckStyles.toolbar)}>
                      <Button
                        variant="destructive"
                        onClick={() =>
                          action.mutate(() => {
                            actions.remove(removing.id);
                            setRemoving(null);
                          })
                        }
                      >
                        Delete tag
                      </Button>
                      <Button variant="secondary" onClick={() => setRemoving(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </Tabs.Panel>
          ))}
          <Tabs.Panel value="templates">
            <div {...stylex.props(deckStyles.fields)}>
              <p {...stylex.props(tagStyles.caption)}>
                Templates contain category names and colors. Applying one adds missing categories
                and keeps existing tags and card assignments.
              </p>
              <Form
                style={deckStyles.fields}
                onSubmit={(event) => {
                  event.preventDefault();
                  action.mutate(() => {
                    actions.saveTemplate(templateName, categories);
                    setTemplateName("");
                    setNotice("Template saved.");
                  });
                }}
              >
                <label {...stylex.props(deckStyles.field)}>
                  Template name
                  <Input
                    value={templateName}
                    onValueChange={setTemplateName}
                    placeholder="e.g. Commander essentials"
                    maxLength={80}
                  />
                </label>
                <Button
                  type="submit"
                  disabled={!templateName.trim() || !local.length || action.isPending}
                >
                  Save {local.length} deck categories as template
                </Button>
                {!local.length ? (
                  <p {...stylex.props(tagStyles.caption)}>
                    Create categories in “This deck” first.
                  </p>
                ) : null}
              </Form>
              <div {...stylex.props(styles.rows)}>
                {templates.map((template) => (
                  <div key={template.id} {...stylex.props(styles.template)}>
                    <strong>{template.name}</strong>
                    <div {...stylex.props(tagStyles.chips)}>
                      {template.categories.map((category) => (
                        <CardTagBadge
                          key={category.name}
                          tag={{ ...category, id: category.name, deckId }}
                        />
                      ))}
                    </div>
                    <div {...stylex.props(deckStyles.toolbar)}>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          action.mutate(() => {
                            const count = actions.applyTemplate(deckId, template.id);
                            setNotice(
                              count
                                ? `Added ${count} categories from ${template.name}.`
                                : "All template categories are already in this deck.",
                            );
                          })
                        }
                      >
                        Apply to deck
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!local.length}
                        onClick={() =>
                          action.mutate(() => {
                            actions.saveTemplate(template.name, categories, template.id);
                            setNotice(`Updated ${template.name} from this deck’s categories.`);
                          })
                        }
                      >
                        Update from deck
                      </Button>
                      <Button
                        variant="ghost"
                        aria-label={`Delete ${template.name} template`}
                        onClick={() =>
                          action.mutate(() => {
                            actions.removeTemplate(template.id);
                            setNotice("Template deleted. Deck categories are unchanged.");
                          })
                        }
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                {!templates.length ? (
                  <p {...stylex.props(styles.empty)}>Your saved templates will appear here.</p>
                ) : null}
              </div>
            </div>
          </Tabs.Panel>
        </Tabs.Root>
        {notice ? <DeckMessage>{notice}</DeckMessage> : null}
        {action.error ? <DeckMessage error>{action.error.message}</DeckMessage> : null}
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
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
  const save = useMutation({
    mutationFn: async () => {
      onSave({ name, color });
      setName("");
    },
  });
  return (
    <Form
      style={deckStyles.fields}
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div {...stylex.props(deckStyles.toolbar)}>
        <label {...stylex.props(deckStyles.field, styles.name)}>
          Tag name
          <Input value={name} onValueChange={setName} placeholder="e.g. Ramp" maxLength={80} />
        </label>
        <DeckSelect label="Color" value={color} onChange={setColor} options={tagColors} />
        <Button type="submit" disabled={!name.trim() || save.isPending}>
          {tag ? "Save tag" : "Create tag"}
        </Button>
        {tag ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      {save.error ? <DeckMessage error>{save.error.message}</DeckMessage> : null}
    </Form>
  );
}

const styles = stylex.create({
  tabs: {
    display: "flex",
    gap: "20px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
    marginBottom: "20px",
  },
  tab: {
    display: "flex",
    gap: "8px",
    backgroundColor: "transparent",
    color: "#a6a89d",
    borderWidth: 0,
    borderBottomWidth: "2px",
    borderBottomStyle: "solid",
    borderBottomColor: "transparent",
    padding: "10px 0",
    font: "inherit",
    cursor: "pointer",
    "[data-active]": { color: "#c4ef8c", borderBottomColor: "#c4ef8c" },
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "3px" },
  },
  name: { flex: "1 1 160px" },
  rows: { display: "grid", gap: "4px" },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    paddingBlock: "10px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  identity: {
    display: "flex",
    flex: 1,
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    minWidth: 0,
  },
  empty: {
    display: "grid",
    justifyItems: "start",
    gap: "12px",
    padding: "24px 0",
    color: "#a6a89d",
    margin: 0,
  },
  template: {
    display: "grid",
    gap: "10px",
    paddingBlock: "18px",
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: "#34362f",
  },
  confirm: {
    padding: "12px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#88605b",
    borderRadius: "4px",
  },
});
