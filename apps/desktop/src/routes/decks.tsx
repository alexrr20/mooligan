import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/decks")({
  component: DecksPage,
});

function DecksPage() {
  return <div>Decks</div>;
}
