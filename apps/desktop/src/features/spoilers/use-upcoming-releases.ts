import { useQuery } from "@tanstack/react-query";

export function useUpcomingReleases() {
  const result = useQuery({
    queryKey: ["catalog", "upcoming"],
    queryFn: () => window.catalog.upcoming(),
    retry: false,
    staleTime: Infinity,
  });

  return {
    error: result.isError ? "Upcoming releases could not be read from the local catalog." : "",
    loading: result.isPending,
    releases: result.data ?? [],
  };
}
