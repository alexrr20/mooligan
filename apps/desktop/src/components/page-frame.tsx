import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { pageInsets } from "../styles/tokens.stylex";

export function PageFrame({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.frame)}>{children}</div>;
}

const styles = stylex.create({
  frame: {
    minHeight: "100%",
    paddingTop: pageInsets.top,
    paddingInline: pageInsets.inline,
    paddingBottom: "32px",
  },
});
