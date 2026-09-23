import { Checkbox } from "@base-ui/react/checkbox";
import { tagColorStyles } from "@mooligan/domain/tags";
import { type CardTag } from "@mooligan/workspace/tag-contract";
import * as stylex from "@stylexjs/stylex";
import { useId, type ReactNode } from "react";

export function CardTagBadge({ tag }: { tag: CardTag }) {
  const color = tagColorStyles[tag.color].hex;
  return (
    <span {...stylex.props(tagStyles.badge, tagStyles.color(color))}>
      <span {...stylex.props(tagStyles.dot)} aria-hidden="true" />
      {tag.name}
      {tag.deckId === null ? <span {...stylex.props(tagStyles.scope)}>Global</span> : null}
    </span>
  );
}

export function TagCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  children?: ReactNode;
}) {
  const labelId = useId();
  return (
    <label {...stylex.props(tagStyles.checkLabel)}>
      <span id={labelId} {...stylex.props(tagStyles.srOnly)}>
        {label}
      </span>
      <Checkbox.Root
        checked={checked}
        indeterminate={indeterminate}
        onCheckedChange={onChange}
        aria-labelledby={labelId}
        {...stylex.props(tagStyles.checkbox)}
      >
        <Checkbox.Indicator aria-hidden="true">{indeterminate ? "−" : "✓"}</Checkbox.Indicator>
      </Checkbox.Root>
      {children}
    </label>
  );
}

export const tagStyles = stylex.create({
  srOnly: {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    borderWidth: 0,
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    maxWidth: "100%",
    padding: "3px 8px",
    borderRadius: "4px",
    backgroundColor: "#242720",
    fontSize: "12px",
    lineHeight: 1.4,
    overflowWrap: "anywhere",
  },
  color: (color: string) => ({ color }),
  dot: {
    width: "6px",
    height: "6px",
    flexShrink: 0,
    borderRadius: "50%",
    backgroundColor: "currentColor",
  },
  scope: { fontSize: "10px", color: "#a6a89d", paddingInlineStart: "3px" },
  chips: { display: "flex", flexWrap: "wrap", gap: "6px", marginBlockStart: "6px" },
  checkbox: {
    display: "inline-flex",
    flexShrink: 0,
    justifyContent: "center",
    alignItems: "center",
    width: "18px",
    height: "18px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "#686d5f",
    borderRadius: "4px",
    backgroundColor: "#171915",
    color: "#171915",
    cursor: "pointer",
    "[data-checked]": { backgroundColor: "#c4ef8c", borderColor: "#c4ef8c" },
    "[data-indeterminate]": { backgroundColor: "#c4ef8c", borderColor: "#c4ef8c" },
    ":focus-visible": { outline: "2px solid #c4ef8c", outlineOffset: "3px" },
  },
  checkLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    cursor: "pointer",
    minWidth: 0,
  },
  list: { display: "grid", gap: "12px", maxHeight: "320px", overflowY: "auto", padding: "4px" },
  caption: { margin: 0, color: "#a6a89d", fontSize: "12px" },
});
