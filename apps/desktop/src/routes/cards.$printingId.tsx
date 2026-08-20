import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { CardDetail, CardDetailProblem, CardDetailSkeleton } from "../features/cards/card-detail";
import { readCatalogSearchOrigin } from "../features/cards/card-navigation";
import { useCatalogCardDetail } from "../features/cards/use-card-detail";
import { ProtectedPreviewGate } from "../features/spoilers/protected-preview-gate";
import {
  cardDetailFocusIdentity,
  shouldMoveCardDetailFocus,
} from "../features/spoilers/spoiler-ui-state";

export const Route = createFileRoute("/cards/$printingId")({
  component: CardDetailRoute,
});

function CardDetailRoute() {
  const { printingId } = Route.useParams();
  const historyState = useLocation({ select: (location) => location.state });
  const origin = useMemo(() => readCatalogSearchOrigin(historyState), [historyState]);
  const { error, loading, result, retry } = useCatalogCardDetail(printingId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousFocusIdentityRef = useRef<string | null>(null);
  const focusIdentity = cardDetailFocusIdentity(printingId, result, Boolean(error));

  useEffect(() => {
    if (!shouldMoveCardDetailFocus(previousFocusIdentityRef.current, focusIdentity)) {
      return;
    }

    previousFocusIdentityRef.current = focusIdentity;

    const frame = requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [focusIdentity]);

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

  if (!result) {
    return <CardDetailProblem headingRef={headingRef} kind="unavailable" origin={origin} />;
  }

  if (result.status === "protected") {
    return <ProtectedPreviewGate headingRef={headingRef} origin={origin} preview={result} />;
  }

  return (
    <CardDetail
      detail={result.detail}
      headingRef={headingRef}
      origin={origin}
      visibility={result.visibility}
    />
  );
}
