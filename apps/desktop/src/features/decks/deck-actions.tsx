import { Menu } from "@base-ui/react/menu";
import * as stylex from "@stylexjs/stylex";
import type { RefObject } from "react";

import { Button } from "../../components/ui/button";
import { uiColors, uiRadii } from "../../components/ui/theme.stylex";

export function DeckActions({
  triggerRef,
  archived,
  onEdit,
  onDuplicate,
  onArchive,
  onImport,
  onExport,
  onDelete,
}: {
  triggerRef: RefObject<HTMLButtonElement | null>;
  archived: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onImport: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger ref={triggerRef} render={<Button variant="secondary" />}>
        Deck actions <span aria-hidden="true">▾</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={6} {...stylex.props(styles.positioner)}>
          <Menu.Popup {...stylex.props(styles.popup)}>
            <Menu.Item onClick={onEdit} {...stylex.props(styles.item)}>
              Edit details
            </Menu.Item>
            <Menu.Item onClick={onDuplicate} {...stylex.props(styles.item)}>
              Duplicate
            </Menu.Item>
            <Menu.Item onClick={onArchive} {...stylex.props(styles.item)}>
              {archived ? "Unarchive" : "Archive"}
            </Menu.Item>
            <Menu.Item onClick={onImport} {...stylex.props(styles.item)}>
              Import
            </Menu.Item>
            <Menu.Item onClick={onExport} {...stylex.props(styles.item)}>
              Export
            </Menu.Item>
            <Menu.Separator {...stylex.props(styles.separator)} />
            <Menu.Item onClick={onDelete} {...stylex.props(styles.item, styles.destructive)}>
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

const styles = stylex.create({
  positioner: { zIndex: 50 },
  popup: {
    minWidth: "180px",
    maxWidth: "var(--available-width)",
    maxHeight: "var(--available-height)",
    overflowY: "auto",
    padding: "4px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: uiColors.border,
    borderRadius: uiRadii.md,
    backgroundColor: uiColors.popover,
    color: uiColors.popoverForeground,
    boxShadow: "0 8px 24px rgb(0 0 0 / 25%)",
    outline: "none",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  item: {
    padding: "6px 10px",
    borderRadius: uiRadii.sm,
    cursor: "default",
    outline: "none",
    userSelect: "none",
    "[data-highlighted]": { backgroundColor: uiColors.accent },
  },
  destructive: {
    color: uiColors.destructive,
    "[data-highlighted]": { backgroundColor: uiColors.destructive20 },
  },
  separator: { height: "1px", margin: "4px", backgroundColor: uiColors.border },
});
