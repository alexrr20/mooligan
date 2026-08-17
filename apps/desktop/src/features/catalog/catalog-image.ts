import type { CatalogImageDescriptor } from "@mooligan/domain/catalog-detail";

export function catalogImageUrl(image: CatalogImageDescriptor) {
  return `mooligan-image://catalog/${encodeURIComponent(image.printingId)}/${image.faceIndex}/${image.size}`;
}
