import type { TagColor } from "@mooligan/domain/tags";

export const tagColorStyles = {
  sage: { label: "Sage", hex: "#c4ef8c" },
  blue: { label: "Blue", hex: "#91c5ff" },
  rose: { label: "Rose", hex: "#f5a6b8" },
  amber: { label: "Amber", hex: "#efc477" },
  violet: { label: "Violet", hex: "#c8adf5" },
  slate: { label: "Slate", hex: "#b8c1bf" },
} as const satisfies Record<TagColor, { label: string; hex: string }>;
