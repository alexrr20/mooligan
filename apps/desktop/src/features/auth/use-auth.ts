import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const authQueryKey = ["auth"] as const;
const signedOut: AuthSnapshot = {
  pendingAuth: false,
  status: "signed-out",
  user: null,
};

export function useAuth() {
  const bridge = window.auth;
  const queryClient = useQueryClient();
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: authQueryKey,
    queryFn: () => bridge.read(),
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    const stopSnapshot = bridge.onChanged((snapshot) => {
      setCallbackError(null);
      queryClient.setQueryData(authQueryKey, snapshot);
    });
    const stopError = bridge.onError(setCallbackError);

    return () => {
      stopSnapshot();
      stopError();
    };
  }, [bridge, queryClient]);

  const signIn = useMutation({
    mutationFn: () => bridge.signIn(),
    onSuccess: (snapshot) => queryClient.setQueryData(authQueryKey, snapshot),
  });
  const refresh = useMutation({
    mutationFn: () => bridge.refresh(),
    onSuccess: (snapshot) => queryClient.setQueryData(authQueryKey, snapshot),
  });
  const signOut = useMutation({
    mutationFn: () => bridge.signOut(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: authQueryKey }),
    onSuccess: (snapshot) => queryClient.setQueryData(authQueryKey, snapshot),
  });
  const mutationError = signIn.error ?? refresh.error ?? signOut.error;

  return {
    busy: signIn.isPending || refresh.isPending || signOut.isPending,
    error: callbackError ?? (mutationError instanceof Error ? mutationError.message : null),
    loading: query.isLoading,
    refresh: refresh.mutate,
    signIn: signIn.mutate,
    signOut: signOut.mutate,
    snapshot: query.data ?? signedOut,
  };
}
