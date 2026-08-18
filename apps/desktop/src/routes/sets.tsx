import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sets")({
  component: SetsPage,
});

function SetsPage() {
  return <div>Sets</div>;
}
