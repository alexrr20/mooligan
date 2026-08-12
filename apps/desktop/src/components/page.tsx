import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { colors } from "../styles/tokens.stylex.js";

type PageProps = {
  children: ReactNode;
  description: string;
  eyebrow: string;
  number: string;
  title: string;
};

type StarterPageProps = Omit<PageProps, "children"> & {
  emptyCopy: string;
  emptyTitle: string;
};

export function Page({ children, description, eyebrow, number, title }: PageProps) {
  return (
    <PageFrame>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.eyebrowRow)}>
          <p {...stylex.props(styles.eyebrow)}>{eyebrow}</p>
          <span {...stylex.props(styles.pageNumber)}>{number} / 07</span>
        </div>
        <h1 {...stylex.props(styles.title)}>{title}</h1>
        <p {...stylex.props(styles.description)}>{description}</p>
      </header>
      <div {...stylex.props(styles.content)}>{children}</div>
    </PageFrame>
  );
}

export function PageFrame({ children }: Pick<PageProps, "children">) {
  return <div {...stylex.props(styles.page)}>{children}</div>;
}

export function StarterPage({
  description,
  emptyCopy,
  emptyTitle,
  eyebrow,
  number,
  title,
}: StarterPageProps) {
  return (
    <Page description={description} eyebrow={eyebrow} number={number} title={title}>
      <section {...stylex.props(styles.starterPanel)}>
        <div {...stylex.props(styles.panelTop)}>
          <span>Workspace ready</span>
          <span>Nothing here yet</span>
        </div>
        <div {...stylex.props(styles.emptyState)}>
          <span {...stylex.props(styles.marker)} aria-hidden="true">
            {number}
          </span>
          <div>
            <h2 {...stylex.props(styles.emptyTitle)}>{emptyTitle}</h2>
            <p {...stylex.props(styles.emptyCopy)}>{emptyCopy}</p>
          </div>
        </div>
        <span {...stylex.props(styles.ghostNumber)} aria-hidden="true">
          {number}
        </span>
      </section>
    </Page>
  );
}

const styles = stylex.create({
  page: {
    minHeight: "100%",
    padding: {
      default: "52px clamp(36px, 6vw, 88px) 64px",
      "@media (max-width: 820px)": "42px 34px 52px",
    },
  },
  header: {
    maxWidth: "980px",
  },
  eyebrowRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    paddingBottom: "18px",
    borderBottom: "1px solid #34362f",
  },
  eyebrow: {
    margin: 0,
    color: "#a6a89d",
    fontSize: "9px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
  },
  pageNumber: {
    color: "#85887e",
    fontSize: "8px",
    letterSpacing: "0.1em",
  },
  title: {
    maxWidth: "880px",
    margin: "34px 0 0",
    color: "#f4f1e8",
    fontSize: {
      default: "clamp(58px, 7.8vw, 104px)",
      "@media (max-width: 820px)": "54px",
    },
    fontWeight: 400,
    letterSpacing: "-0.055em",
    lineHeight: 0.9,
  },
  description: {
    maxWidth: "560px",
    margin: "26px 0 0",
    color: "#a6a89d",
    fontSize: "14px",
    lineHeight: 1.65,
  },
  content: {
    marginTop: {
      default: "58px",
      "@media (max-width: 820px)": "44px",
    },
  },
  starterPanel: {
    minHeight: "270px",
    position: "relative",
    overflow: "hidden",
    borderTop: "1px solid #34362f",
    borderBottom: "1px solid #34362f",
  },
  panelTop: {
    position: "relative",
    zIndex: 1,
    paddingBlock: "13px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "24px",
    color: "#85887e",
    fontSize: "8px",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  emptyState: {
    minHeight: "218px",
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: "24px",
  },
  marker: {
    width: "66px",
    height: "88px",
    flex: "0 0 auto",
    display: "grid",
    placeItems: "center",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.accent,
    borderRadius: "4px",
    color: "#1b1d19",
    backgroundColor: colors.accent,
    fontSize: "10px",
    boxShadow: "8px 8px 0 #242620",
  },
  emptyTitle: {
    margin: "0 0 8px",
    color: "#f4f1e8",
    fontSize: "25px",
    fontWeight: 400,
    letterSpacing: "-0.02em",
  },
  emptyCopy: {
    maxWidth: "430px",
    margin: 0,
    color: "#a6a89d",
    fontSize: "12px",
    lineHeight: 1.6,
  },
  ghostNumber: {
    position: "absolute",
    right: "-14px",
    bottom: "-56px",
    color: "rgba(244, 241, 232, 0.035)",
    fontSize: "220px",
    letterSpacing: "-0.08em",
    lineHeight: 1,
    userSelect: "none",
  },
});
