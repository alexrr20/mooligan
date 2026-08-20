import { useQuery } from "@tanstack/react-query";

const emptySummaries: SpoilerRevealSummaries = { printings: [], releases: [] };

export function useSpoilerRevealSummaries() {
  const result = useQuery({
    queryKey: ["catalog", "spoiler-reveals"],
    queryFn: () => window.catalog.spoilerRevealSummaries(),
    retry: false,
    staleTime: Infinity,
  });

  return {
    error: result.isError ? "Reveal details could not be read from the local catalog." : "",
    loading: result.isPending,
    summaries: result.data ?? emptySummaries,
  };
}
