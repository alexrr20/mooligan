import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { CardDetail, CardDetailProblem, CardDetailSkeleton } from "../features/cards/card-detail";
import { readCatalogSearchOrigin } from "../features/cards/card-navigation";
import { useCatalogCardDetail } from "../features/cards/use-card-detail";

export const Route = createFileRoute("/cards/$printingId")({
  component: CardDetailRoute,
});

function CardDetailRoute() {
  const { printingId } = Route.useParams();
  const historyState = useLocation({ select: (location) => location.state });
  const origin = useMemo(() => readCatalogSearchOrigin(historyState), [historyState]);
  const { detail, error, loading, retry } = useCatalogCardDetail(printingId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigationIndex = historyState.__TSR_index;
  const focusReady = !loading && (detail !== undefined || Boolean(error));

  useEffect(() => {
    if (!focusReady || navigationIndex <= 0) {
      return;
    }

    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [focusReady, navigationIndex, printingId]);

  if (loading) {
    return <CardDetailSkeleton origin={origin} />;
  }

  if (error) {
    return (
      <CardDetailProblem
        headingRef={headingRef}
        kind="error"
        origin={origin}
        onRetry={() => void retry()}
      />
    );
  }

  if (!detail) {
    return <CardDetailProblem headingRef={headingRef} kind="unavailable" origin={origin} />;
  }

  return <CardDetail detail={detail} headingRef={headingRef} origin={origin} />;
}
