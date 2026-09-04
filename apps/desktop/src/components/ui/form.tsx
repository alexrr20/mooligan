import { Form as FormPrimitive } from "@base-ui/react/form";
import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";

export type FormProps<FormValues extends Record<string, never> = Record<string, never>> = Omit<
  FormPrimitive.Props<FormValues>,
  "className" | "style"
> & { style?: StyleXStyles };

export function Form<FormValues extends Record<string, never> = Record<string, never>>({
  style,
  ...props
}: FormProps<FormValues>) {
  return <FormPrimitive {...stylex.props(style)} data-slot="form" {...props} />;
}
