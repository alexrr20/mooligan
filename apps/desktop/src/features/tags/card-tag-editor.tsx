import { EditorSelect, EditorMessage, editorStyles } from "../../components/ui/editor-controls";
import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { tagsForDeck } from "@mooligan/workspace/client/tag-state";
import { useAction } from "../../hooks/use-action";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Form } from "../../components/ui/form";

import { CardTagBadge, TagCheckbox, tagStyles } from "./card-tag-controls";
import { useCardTags } from "./use-card-tags";

export function CardTagEditor({
  deckId,
  cardIds,
  title,
  onClose,
}: {
  deckId: string;
  cardIds: readonly string[];
  title: string;
  onClose: () => void;
}) {
  const { tags, assignments, actions } = useCardTags();
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("deck");
  const available = tagsForDeck(tags, deckId);
  const matching = available.filter((tag) =>
    tag.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const action = useAction();
  const ids = new Set(cardIds);
  const counts = new Map<string, number>();
  for (const assignment of assignments) {
    if (ids.has(assignment.cardId))
      counts.set(assignment.tagId, (counts.get(assignment.tagId) ?? 0) + 1);
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent style={editorStyles.dialog}>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          Give cards more than one role. Global tags follow every printing across your decks.
          Changes save immediately.
        </DialogDescription>
        <Form
          style={editorStyles.fields}
          onSubmit={(event) => {
            event.preventDefault();
            action.run(() => {
              const tagId = actions.create(scope === "global" ? null : deckId, {
                name: search,
                color: "sage",
              });
              actions.assign(tagId, cardIds, true);
              setSearch("");
            });
          }}
        >
          <Input
            aria-label="Find or create a card tag"
            placeholder="Find or create a tag…"
            value={search}
            onValueChange={setSearch}
            maxLength={80}
          />
          <div {...stylex.props(tagStyles.list)}>
            {matching.map((tag) => {
              const count = counts.get(tag.id) ?? 0;
              return (
                <TagCheckbox
                  key={tag.id}
                  label={tag.name + (tag.deckId === null ? ", global" : ", this deck")}
                  checked={count === ids.size && ids.size > 0}
                  indeterminate={count > 0 && count < ids.size}
                  onChange={(checked) => action.run(() => actions.assign(tag.id, cardIds, checked))}
                >
                  <CardTagBadge tag={tag} />
                  {ids.size > 1 ? (
                    <span {...stylex.props(tagStyles.caption)}>
                      {count}/{ids.size}
                    </span>
                  ) : null}
                </TagCheckbox>
              );
            })}
            {!matching.length ? (
              <p {...stylex.props(tagStyles.caption)}>
                {available.length
                  ? "No matching tags."
                  : "Start with a role such as Ramp, Removal, or Card draw."}
              </p>
            ) : null}
          </div>
          <div {...stylex.props(editorStyles.toolbar)}>
            <EditorSelect
              label="New tag scope"
              value={scope}
              onChange={setScope}
              options={[
                { value: "deck", label: "This deck" },
                { value: "global", label: "Global" },
              ]}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={
                !search.trim() ||
                available.some(
                  (tag) =>
                    tag.deckId === (scope === "global" ? null : deckId) &&
                    tag.name.toLowerCase() === search.trim().toLowerCase(),
                )
              }
            >
              Create and apply
            </Button>
          </div>
          {action.error ? <EditorMessage error>{action.error.message}</EditorMessage> : null}
        </Form>
        <Button onClick={onClose}>Done</Button>
      </DialogContent>
    </Dialog>
  );
}
