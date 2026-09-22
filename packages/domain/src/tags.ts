import * as z from "zod";

export const tagColors = [
  { value: "sage", label: "Sage", hex: "#c4ef8c" },
  { value: "blue", label: "Blue", hex: "#91c5ff" },
  { value: "rose", label: "Rose", hex: "#f5a6b8" },
  { value: "amber", label: "Amber", hex: "#efc477" },
  { value: "violet", label: "Violet", hex: "#c8adf5" },
  { value: "slate", label: "Slate", hex: "#b8c1bf" },
] as const;

export const TagStyleSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  color: z.enum(["sage", "blue", "rose", "amber", "violet", "slate"]),
});
export type TagStyle = z.infer<typeof TagStyleSchema>;

export const CardTagSchema = TagStyleSchema.extend({
  id: z.string().min(1).max(128),
  deckId: z.string().min(1).max(128).nullable(),
});
export type CardTag = z.infer<typeof CardTagSchema>;

export const TagAssignmentSchema = z.strictObject({
  tagId: z.string().min(1).max(128),
  cardId: z.string().min(1).max(128),
});
export type TagAssignment = z.infer<typeof TagAssignmentSchema>;

export const TagTemplateSchema = z.strictObject({
  id: z.string().min(1).max(128),
  name: z.string().trim().min(1).max(80),
  categories: z
    .array(TagStyleSchema)
    .min(1)
    .max(100)
    .refine(
      (categories) =>
        new Set(categories.map(({ name }) => tagNameKey(name))).size === categories.length,
      "Category names must be unique.",
    ),
});
export type TagTemplate = z.infer<typeof TagTemplateSchema>;

export function tagNameKey(name: string) {
  return name.trim().toLowerCase();
}

export const starterCategories: readonly TagStyle[] = [
  { name: "Ramp", color: "sage" },
  { name: "Card draw", color: "blue" },
  { name: "Removal", color: "rose" },
  { name: "Board wipes", color: "amber" },
  { name: "Protection", color: "violet" },
  { name: "Finishers", color: "slate" },
];
