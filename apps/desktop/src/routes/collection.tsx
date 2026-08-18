import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/collection")({
  component: CollectionPage,
});

function CollectionPage() {
  return <div>Collection</div>;
}
