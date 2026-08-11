import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const preferenceSyncQueryKey = ["preference-sync"] as const;
const localOnly: PreferenceSyncSnapshot = { status: "local-only" };

export function usePreferenceSync() {
  const bridge = window.preferenceSync;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: preferenceSyncQueryKey,
    queryFn: () => bridge.read(),
    retry: false,
    staleTime: Infinity,
  });
  const retry = useMutation({
    mutationFn: () => bridge.retry(),
    onSuccess: (snapshot) => queryClient.setQueryData(preferenceSyncQueryKey, snapshot),
  });

  useEffect(() => {
    return bridge.onChanged((snapshot) => {
      queryClient.setQueryData(preferenceSyncQueryKey, snapshot);
    });
  }, [bridge, queryClient]);

  return {
    busy: retry.isPending,
    retry: retry.mutate,
    snapshot: query.data ?? localOnly,
  };
}
