import type { Store } from "@livestore/livestore";
import {
  collectionLotsQuery,
  events,
  profileQuery,
  readProfile,
  workspaceSchema,
} from "@mooligan/workspace/schema";

type WorkspaceStore = Store<typeof workspaceSchema>;

export async function featureProfileCard(
  store: WorkspaceStore,
  detail: Window["catalog"]["detail"],
  slot: number,
  printingId: string | null,
) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 4) {
    throw new Error("Choose one of the four featured card slots.");
  }
  if (printingId !== null) {
    const result = await detail(printingId);
    if (result?.status !== "visible") throw new Error("This card is unavailable or protected.");
    if (!store.query(collectionLotsQuery).some((lot) => lot.printingId === printingId)) {
      throw new Error("Choose a card you currently own in this collection.");
    }
  }
  const profile = readProfile(store.query(profileQuery));
  if (
    printingId &&
    profile.featuredPrintingIds.some((id, index) => index !== slot && id === printingId)
  ) {
    throw new Error("That printing is already featured. Choose another card.");
  }
  store.commit(
    events.profileChanged({
      ...profile,
      featuredPrintingIds: profile.featuredPrintingIds.map((id, index) =>
        index === slot ? printingId : id,
      ),
    }),
  );
}

export async function changeProfileBanner(
  store: WorkspaceStore,
  detail: Window["catalog"]["detail"],
  printingId: string | null,
) {
  if (printingId !== null) {
    const result = await detail(printingId);
    if (
      result?.status !== "visible" ||
      !result.detail.selectedPrinting.images.some(
        (image) => image.faceIndex === 0 && image.size === "art_crop",
      )
    ) {
      throw new Error("This printing has no available banner artwork. Choose another card.");
    }
  }
  store.commit(
    events.profileChanged({
      ...readProfile(store.query(profileQuery)),
      bannerPrintingId: printingId,
    }),
  );
}
