import { queryOptions, useQuery } from "@tanstack/react-query";

export function useCatalogCardDetail(printingId: string) {
  const result = useQuery(catalogCardDetailQueryOptions(window.catalog.detail, printingId));

  return {
    error:
      result.isError && result.data === undefined
        ? "The local card library could not read this printing."
        : "",
    loading: result.isPending,
    result: result.data,
    retry: result.refetch,
  };
}

export function catalogCardDetailQueryOptions(
  detail: Window["catalog"]["detail"],
  printingId: string,
) {
  return queryOptions({
    queryKey: ["catalog", "detail", printingId],
    queryFn: () => detail(printingId),
    retry: 1,
    staleTime: Infinity,
  });
}
