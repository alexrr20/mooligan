import { cardTagsQuery, tagAssignmentsQuery, tagTemplatesQuery } from "@mooligan/workspace/tags";
import { createTagMutations } from "@mooligan/workspace/client/tag-mutations";
import { materializeTagTemplates } from "@mooligan/workspace/client/tag-state";
import { useWorkspaceLiveStore } from "../workspace/workspace-store-context";

export function useCardTags() {
  const store = useWorkspaceLiveStore();
  return {
    tags: store.useQuery(cardTagsQuery),
    assignments: store.useQuery(tagAssignmentsQuery),
    templates: materializeTagTemplates(store.useQuery(tagTemplatesQuery)),
    actions: createTagMutations(store),
  };
}
