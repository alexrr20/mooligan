export const PRINTING_GALLERY_BATCH_SIZE = 24;

export function getInitialGalleryVisibleCount(itemCount: number, selectedIndex: number): number {
  const minimum = Math.min(PRINTING_GALLERY_BATCH_SIZE, itemCount);
  if (selectedIndex < 0 || selectedIndex >= itemCount) {
    return minimum;
  }

  const selectedBatchEnd =
    Math.ceil((selectedIndex + 1) / PRINTING_GALLERY_BATCH_SIZE) * PRINTING_GALLERY_BATCH_SIZE;
  return Math.min(itemCount, Math.max(minimum, selectedBatchEnd));
}

export function getNextGalleryVisibleCount(itemCount: number, visibleCount: number): number {
  return Math.min(itemCount, visibleCount + PRINTING_GALLERY_BATCH_SIZE);
}
