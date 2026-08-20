import { createFileRoute } from "@tanstack/react-router";

import { PageFrame } from "../components/page-frame";
import { UpcomingReleases } from "../features/spoilers/upcoming-releases";

export const Route = createFileRoute("/sets")({
  component: SetsPage,
});

function SetsPage() {
  return (
    <PageFrame>
      <UpcomingReleases />
    </PageFrame>
  );
}
