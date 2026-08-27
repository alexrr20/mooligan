import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { CardLoadingIndicator } from "../components/card-loading-indicator";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div {...stylex.props(styles.page)}>
      <CardLoadingIndicator label="Loading Home" />
    </div>
  );
}

const styles = stylex.create({
  page: {
    minHeight: "calc(100vh - 160px)",
    display: "grid",
    placeItems: "center",
  },
});
