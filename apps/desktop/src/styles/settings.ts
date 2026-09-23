import * as stylex from "@stylexjs/stylex";

export const settingStyles = stylex.create({
  settingIntro: {
    paddingBlock: "26px 30px",
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(220px, 0.75fr) minmax(300px, 1fr)",
      "@media (max-width: 820px)": "1fr",
    },
    gap: {
      default: "56px",
      "@media (max-width: 820px)": "18px",
    },
    alignItems: "end",
  },
  settingTitle: {
    margin: 0,
    color: "#f4f1e8",
  },
  settingCopy: {
    maxWidth: "520px",
    margin: 0,
    color: "#a6a89d",
  },
  accountEmail: {
    overflow: "hidden",
    maxWidth: "430px",
    color: "#85887e",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  accountActions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  accountError: {
    margin: 0,
    padding: "11px 22px",
    color: "#ef9a8f",
    backgroundColor: "rgba(170, 45, 34, 0.1)",
  },
});
