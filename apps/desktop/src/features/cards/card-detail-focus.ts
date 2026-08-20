export function cardDetailFocusKey(
  result: { status: "protected" | "visible" } | null | undefined,
  hasError: boolean,
) {
  if (hasError) {
    return "error";
  }
  if (result === undefined) {
    return null;
  }
  return result?.status ?? "unavailable";
}

export function cardDetailFocusIdentity(
  printingId: string,
  result: { status: "protected" | "visible" } | null | undefined,
  hasError: boolean,
) {
  const key = cardDetailFocusKey(result, hasError);
  return key === null ? null : `${printingId}:${key}`;
}

export function shouldMoveCardDetailFocus(
  previousIdentity: string | null,
  nextIdentity: string | null,
) {
  return nextIdentity !== null && previousIdentity !== nextIdentity;
}
