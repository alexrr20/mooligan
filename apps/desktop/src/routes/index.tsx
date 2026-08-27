import * as stylex from "@stylexjs/stylex";
import { createFileRoute } from "@tanstack/react-router";

import { SolidCardLoadingIndicator } from "../components/solid-card-loading-indicator";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div {...stylex.props(styles.page)}>
      <SolidCardLoadingIndicator label="Loading Home" />
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
