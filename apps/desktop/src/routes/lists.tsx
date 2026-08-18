import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/lists")({
  component: ListsPage,
});

function ListsPage() {
  return <div>Lists</div>;
}
