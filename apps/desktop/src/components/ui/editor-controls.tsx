import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export function EditorSelect<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  hideLabel = false,
}: {
  label: string;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  return (
    <div {...stylex.props(editorStyles.field)}>
      {hideLabel ? null : <span>{label}</span>}
      <Select<T>
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label} size="sm" style={editorStyles.control}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function EditorMessage({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <p
      {...stylex.props(editorStyles.message, error && editorStyles.error)}
      role={error ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export const editorStyles = stylex.create({
  toolbar: { display: "flex", alignItems: "end", flexWrap: "wrap", gap: "8px" },
  field: { display: "grid", gap: "4px", minWidth: 0, fontSize: "12px" },
  control: { height: "28px", fontSize: "13px" },
  fields: { display: "grid", gap: "16px" },
  muted: { color: "#a6a89d", margin: 0 },
  message: { margin: 0, color: "#a6a89d", overflowWrap: "anywhere" },
  error: { color: "#ffaaa3" },
  dialog: { maxWidth: "min(680px, calc(100% - 32px))", maxHeight: "85vh", overflowY: "auto" },
});
