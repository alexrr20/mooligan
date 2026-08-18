import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

export function PageFrame({ children }: { children: ReactNode }) {
  return <div {...stylex.props(styles.frame)}>{children}</div>;
}

const styles = stylex.create({
  frame: {
    minHeight: "100%",
    padding: {
      default: "52px clamp(36px, 6vw, 88px) 64px",
      "@media (max-width: 820px)": "42px 34px 52px",
    },
  },
});
