import * as z from "zod";

import { FinishSchema } from "./catalog.ts";

const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", {
  message: "Expected an HTTPS URL",
});

export const CatalogReleaseSchema = z.object({
  compressedSize: z.number().int().positive(),
  downloadUrl: httpsUrlSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});
export type CatalogRelease = z.infer<typeof CatalogReleaseSchema>;

export const ScryfallBulkDataSchema = z.object({
  compressed_size: z.number().int().positive(),
  jsonl_download_uri: httpsUrlSchema,
  type: z.literal("default_cards"),
  updated_at: z.iso.datetime({ offset: true }),
});

const ScryfallImageUrisSchema = z.object({
  normal: z.url().nullish(),
  small: z.url().nullish(),
  thumb: z.url().nullish(),
});

const ScryfallCardFaceDownloadSchema = z.object({
  artist: z.string().nullish(),
  defense: z.string().nullish(),
  image_uris: ScryfallImageUrisSchema.nullish(),
  loyalty: z.string().nullish(),
  mana_cost: z.string().nullish(),
  name: z.string().min(1).optional(),
  oracle_text: z.string().nullish(),
  power: z.string().nullish(),
  toughness: z.string().nullish(),
  type_line: z.string().min(1).optional(),
});

const ScryfallLegalityStatusSchema = z.enum(["legal", "not_legal", "restricted", "banned"]);

export const ScryfallCardDownloadSchema = z
  .object({
    artist: z.string().nullish(),
    card_faces: z.array(ScryfallCardFaceDownloadSchema).optional(),
    collector_number: z.string().min(1),
    color_identity: z.array(z.enum(["W", "U", "B", "R", "G"])).optional(),
    cmc: z.number().nonnegative().optional(),
    defense: z.string().nullish(),
    digital: z.boolean().optional(),
    finishes: z.array(FinishSchema).optional(),
    id: z.string().min(1),
    image_uris: ScryfallImageUrisSchema.nullish(),
    keywords: z.array(z.string().min(1)).optional(),
    lang: z.string().min(1).nullish(),
    legalities: z.record(z.string().min(1), ScryfallLegalityStatusSchema).optional(),
    loyalty: z.string().nullish(),
    mana_cost: z.string().nullish(),
    name: z.string().min(1),
    object: z.literal("card"),
    oracle_text: z.string().nullish(),
    oracle_id: z.string().min(1).nullable().optional(),
    power: z.string().nullish(),
    promo: z.boolean().optional(),
    rarity: z.string().min(1),
    released_at: z.iso.date().nullish(),
    set: z.string().min(1),
    set_name: z.string().min(1),
    toughness: z.string().nullish(),
    type_line: z.string().min(1).optional(),
  })
  .transform((card) => ({
    ...card,
    type_line:
      card.type_line ??
      [
        ...new Set(
          card.card_faces?.flatMap((face) => (face.type_line ? [face.type_line] : [])) ?? [],
        ),
      ].join(" // "),
  }))
  .refine((card) => card.type_line.length > 0, {
    message: "A card or card face must provide a type line",
    path: ["type_line"],
  });

export type ScryfallCardDownload = z.infer<typeof ScryfallCardDownloadSchema>;
