import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

const preferencesQueryKey = ["preferences"] as const;
const defaultPreferences: Preferences = { motion: "system", spoilerPolicy: "protect" };

export function usePreferences() {
  const bridge = window.preferences;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: preferencesQueryKey,
    queryFn: () => bridge.read(),
    retry: false,
    staleTime: Infinity,
  });
  const mutation = useMutation({
    mutationFn: (update: Partial<Preferences>) => bridge.update(update),
    onSuccess: (preferences) => {
      queryClient.setQueryData(preferencesQueryKey, preferences);
    },
  });

  useEffect(() => {
    return bridge.onChanged((preferences) => {
      queryClient.setQueryData(preferencesQueryKey, preferences);
    });
  }, [bridge, queryClient]);

  return {
    error: query.error ?? mutation.error,
    loading: query.isLoading,
    preferences: query.data ?? defaultPreferences,
    saving: mutation.isPending,
    update: mutation.mutate,
  };
}
