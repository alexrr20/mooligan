import { useQuery } from "@tanstack/react-query";

export function useCatalogCardDetail(printingId: string) {
  const result = useQuery({
    queryKey: ["catalog", "detail", printingId],
    queryFn: () => window.catalog.detail(printingId),
    retry: 1,
    staleTime: Infinity,
  });

  return {
    detail: result.data,
    error:
      result.isError && result.data === undefined
        ? "The local card library could not read this printing."
        : "",
    loading: result.isPending,
    retry: result.refetch,
  };
}
