import type {
  SpoilerProjectionConnection,
  SpoilerProjectionDecision,
  SpoilerProjectionDelta,
  SpoilerProjectionSnapshot,
} from "@mooligan/domain/spoilers";
import { spoilerDecisionsQuery, spoilerSettingsQuery } from "@mooligan/workspace/spoilers";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useWorkspaceLiveStore } from "./workspace-store-context";

type ProjectedSpoilers = Pick<SpoilerProjectionSnapshot, "decisions" | "policy">;

export function SpoilerProjectionStartup({
  children,
  loading,
  workspaceId,
}: {
  children: ReactNode;
  loading: ReactNode;
  workspaceId: string;
}) {
  const store = useWorkspaceLiveStore();
  const queryClient = useQueryClient();
  const settings = store.useQuery(spoilerSettingsQuery);
  const rows = store.useQuery(spoilerDecisionsQuery);
  const projection = useMemo<ProjectedSpoilers>(
    () => ({
      decisions: rows.map(({ scope, state, targetId }) => ({ scope, state, targetId })),
      policy: settings.policy,
    }),
    [rows, settings.policy],
  );
  const projectionKey = JSON.stringify(projection);
  const connection = useRef<SpoilerProjectionConnection>(undefined);
  const lastProjection = useRef<ProjectedSpoilers>(undefined);
  const queue = useRef(Promise.resolve());
  const revision = useRef(0);
  const [readyKey, setReadyKey] = useState<string>();
  const [failure, setFailure] = useState<Error>();

  useLayoutEffect(() => {
    queryClient.removeQueries({ queryKey: ["catalog"] });
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        connection.current ??= await window.workspaceProjection.connectSpoilers(workspaceId);
        revision.current += 1;

        const identity = {
          ...connection.current,
          revision: revision.current,
        };
        const previous = lastProjection.current;
        let result;
        if (previous) {
          const delta: SpoilerProjectionDelta = {
            ...identity,
            decisions: changedDecisions(previous.decisions, projection.decisions),
          };
          if (previous.policy !== projection.policy) {
            delta.policy = projection.policy;
          }
          result = await window.workspaceProjection.applySpoilerDelta(delta);
        } else {
          result = await window.workspaceProjection.replaceSpoilers({ ...identity, ...projection });
        }
        const applied =
          result.status === "applied"
            ? result
            : await window.workspaceProjection.replaceSpoilers({ ...identity, ...projection });

        if (applied.status !== "applied") {
          throw new Error("The spoiler projection could not be synchronized.");
        }

        lastProjection.current = projection;
        setReadyKey(projectionKey);
      })
      .catch((cause: unknown) => {
        setFailure(cause instanceof Error ? cause : new Error(String(cause)));
      });
  }, [projection, projectionKey, queryClient, workspaceId]);

  useEffect(
    () =>
      window.workspaceProjection.onSpoilersChanged(() => {
        void queryClient.resetQueries({ queryKey: ["catalog"] });
      }),
    [queryClient],
  );

  if (failure) {
    throw failure;
  }
  return readyKey === projectionKey ? children : loading;
}

function changedDecisions(
  previous: readonly SpoilerProjectionDecision[],
  next: readonly SpoilerProjectionDecision[],
) {
  const previousByTarget = new Map(previous.map((decision) => [decisionKey(decision), decision]));
  const nextByTarget = new Map(next.map((decision) => [decisionKey(decision), decision]));
  const changed = next.filter((decision) => {
    const before = previousByTarget.get(decisionKey(decision));
    return before?.state !== decision.state;
  });

  for (const decision of previous) {
    if (!nextByTarget.has(decisionKey(decision))) {
      changed.push({ ...decision, state: "protect" });
    }
  }
  return changed;
}

function decisionKey({ scope, targetId }: Pick<SpoilerProjectionDecision, "scope" | "targetId">) {
  return `${scope}\0${targetId}`;
}
