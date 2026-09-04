import { Field as FieldPrimitive } from "@base-ui/react/field";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";

import { uiColors, uiRadii } from "./theme.stylex";

type StyleProps = { style?: StyleXStyles };
type FieldOrientation = "horizontal" | "responsive" | "vertical";

export function Field({
  orientation = "vertical",
  style,
  ...props
}: Omit<FieldPrimitive.Root.Props, "className" | "style"> &
  StyleProps & { orientation?: FieldOrientation }) {
  return (
    <FieldPrimitive.Root
      {...stylex.props(
        styles.field,
        orientation === "vertical" && styles.vertical,
        orientation === "horizontal" && styles.horizontal,
        orientation === "responsive" && styles.responsive,
        style,
      )}
      data-orientation={orientation}
      data-slot="field"
      {...props}
    />
  );
}

export function FieldLabel({
  style,
  ...props
}: Omit<FieldPrimitive.Label.Props, "className" | "style"> & StyleProps) {
  return (
    <FieldPrimitive.Label
      {...stylex.props(styles.label, style)}
      data-slot="field-label"
      {...props}
    />
  );
}

export function FieldDescription({
  style,
  ...props
}: Omit<FieldPrimitive.Description.Props, "className" | "style"> & StyleProps) {
  return (
    <FieldPrimitive.Description
      {...stylex.props(styles.description, style)}
      data-slot="field-description"
      {...props}
    />
  );
}

type FieldErrorProps = Omit<FieldPrimitive.Error.Props, "children" | "className" | "style"> &
  StyleProps & {
    children?: ReactNode;
    errors?: readonly ({ message?: string } | undefined)[];
  };

export function FieldError({ children, errors, style, ...props }: FieldErrorProps) {
  const messages = errors
    ? [...new Set(errors.flatMap((error) => (error?.message ? [error.message] : [])))]
    : [];
  const content =
    children ??
    (messages.length === 1 ? (
      messages[0]
    ) : messages.length > 1 ? (
      <ul {...stylex.props(styles.errorList)}>
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    ) : null);

  if (!content) return null;

  return (
    <FieldPrimitive.Error {...stylex.props(styles.error, style)} data-slot="field-error" {...props}>
      {content}
    </FieldPrimitive.Error>
  );
}

export function FieldControl({
  style,
  ...props
}: Omit<FieldPrimitive.Control.Props, "className" | "style"> & StyleProps) {
  return <FieldPrimitive.Control {...stylex.props(style)} data-slot="field-control" {...props} />;
}

export function FieldValidity(props: FieldPrimitive.Validity.Props) {
  return <FieldPrimitive.Validity data-slot="field-validity" {...props} />;
}

export function FieldGroup({
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> & StyleProps) {
  return <div {...stylex.props(styles.group, style)} data-slot="field-group" {...props} />;
}

export function FieldContent({
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> & StyleProps) {
  return <div {...stylex.props(styles.content, style)} data-slot="field-content" {...props} />;
}

export function FieldTitle({
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> & StyleProps) {
  return <div {...stylex.props(styles.title, style)} data-slot="field-label" {...props} />;
}

export function FieldSet({
  style,
  ...props
}: Omit<ComponentProps<"fieldset">, "className" | "style"> & StyleProps) {
  return <fieldset {...stylex.props(styles.fieldSet, style)} data-slot="field-set" {...props} />;
}

export function FieldLegend({
  style,
  variant = "legend",
  ...props
}: Omit<ComponentProps<"legend">, "className" | "style"> &
  StyleProps & { variant?: "label" | "legend" }) {
  return (
    <legend
      {...stylex.props(
        styles.legend,
        variant === "label" ? styles.legendAsLabel : styles.legendAsLegend,
        style,
      )}
      data-slot="field-legend"
      data-variant={variant}
      {...props}
    />
  );
}

export function FieldSeparator({
  children,
  style,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style"> & StyleProps) {
  return (
    <div
      {...stylex.props(styles.separator, style)}
      data-content={Boolean(children)}
      data-slot="field-separator"
      {...props}
    >
      <span {...stylex.props(styles.separatorLine)} aria-hidden="true" />
      {children ? (
        <span {...stylex.props(styles.separatorContent)} data-slot="field-separator-content">
          {children}
        </span>
      ) : null}
    </div>
  );
}

const styles = stylex.create({
  field: {
    width: "100%",
    display: "flex",
    gap: "0.5rem",
    "[data-invalid=true]": { color: uiColors.destructive },
    "[data-invalid]": { color: uiColors.destructive },
  },
  vertical: { flexDirection: "column" },
  horizontal: {
    flexDirection: "row",
    alignItems: "center",
  },
  responsive: {
    flexDirection: {
      default: "column",
      "@media (min-width: 448px)": "row",
    },
    alignItems: {
      default: "stretch",
      "@media (min-width: 448px)": "center",
    },
  },
  label: {
    width: "fit-content",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.375,
    userSelect: "none",
    "[data-disabled]": { opacity: 0.5 },
    ":has([data-checked])": {
      borderColor: "oklch(0.922 0 0 / 20%)",
      backgroundColor: "oklch(0.922 0 0 / 10%)",
    },
    ":has(> [data-slot=field])": {
      width: "100%",
      flexDirection: "column",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: uiColors.border,
      borderRadius: uiRadii.lg,
    },
    ":has(> [data-slot=field]):hover": { backgroundColor: uiColors.muted50 },
    ":has(> [data-slot=field]:focus-visible)": {
      borderColor: uiColors.ring,
      boxShadow: `0 0 0 3px ${uiColors.ring50}`,
    },
  },
  description: {
    margin: 0,
    color: uiColors.mutedForeground,
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: 1.5,
    textAlign: "left",
    ":last-child": { marginTop: 0 },
    ":nth-last-child(2)": { marginTop: "-0.25rem" },
  },
  error: {
    margin: 0,
    color: uiColors.destructive,
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: "1.25rem",
  },
  errorList: {
    marginBlock: 0,
    marginLeft: "1rem",
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    listStyleType: "disc",
  },
  group: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    containerType: "inline-size",
  },
  content: {
    minWidth: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "0.125rem",
    lineHeight: 1.375,
  },
  title: {
    width: "fit-content",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.875rem",
    fontWeight: 500,
    lineHeight: 1.375,
    "[data-disabled]": { opacity: 0.5 },
  },
  fieldSet: {
    minWidth: 0,
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    border: 0,
  },
  legend: {
    marginBottom: "0.375rem",
    padding: 0,
    fontWeight: 500,
  },
  legendAsLabel: {
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  legendAsLegend: {
    fontSize: "1rem",
    lineHeight: "1.5rem",
  },
  separator: {
    height: "1.25rem",
    position: "relative",
    marginBlock: "-0.5rem",
    fontSize: "0.875rem",
    lineHeight: "1.25rem",
  },
  separatorLine: {
    width: "100%",
    height: "1px",
    position: "absolute",
    insetInline: 0,
    top: "50%",
    backgroundColor: uiColors.border,
  },
  separatorContent: {
    width: "fit-content",
    position: "relative",
    marginInline: "auto",
    paddingInline: "0.5rem",
    display: "block",
    color: uiColors.mutedForeground,
    backgroundColor: uiColors.background,
  },
});
