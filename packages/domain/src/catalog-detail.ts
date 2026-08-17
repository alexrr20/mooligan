import * as z from "zod";

import { ColorSchema, FinishSchema, LegalityStatusSchema, RaritySchema } from "./catalog.ts";
import type { ScryfallCardDownload } from "./catalog-sync.ts";

const idSchema = z.string().min(1);
const textSchema = z.string().min(1);

export const CatalogCardFaceSchema = z.object({
  defense: textSchema.optional(),
  loyalty: textSchema.optional(),
  manaCost: textSchema.optional(),
  name: textSchema,
  oracleText: textSchema.optional(),
  power: textSchema.optional(),
  toughness: textSchema.optional(),
  typeLine: textSchema,
});
export type CatalogCardFace = z.infer<typeof CatalogCardFaceSchema>;

export const CatalogCardIdentitySchema = z.object({
  colorIdentity: z.array(ColorSchema),
  faces: z.array(CatalogCardFaceSchema).min(1),
  hasSharedIdentity: z.boolean(),
  id: idSchema,
  keywords: z.array(textSchema),
  manaValue: z.number().nonnegative().optional(),
  name: textSchema,
});
export type CatalogCardIdentity = z.infer<typeof CatalogCardIdentitySchema>;

export const CatalogImageSizeSchema = z.enum(["grid", "normal", "small", "thumb"]);
export type CatalogImageSize = z.infer<typeof CatalogImageSizeSchema>;

export const CatalogImageDescriptorSchema = z.object({
  faceIndex: z.number().int().nonnegative(),
  printingId: idSchema,
  size: CatalogImageSizeSchema,
});
export type CatalogImageDescriptor = z.infer<typeof CatalogImageDescriptorSchema>;

export const CatalogSelectedPrintingSchema = z.object({
  artists: z.array(textSchema).min(1).optional(),
  collectorNumber: textSchema,
  finishes: z.array(FinishSchema).min(1).optional(),
  id: idSchema,
  images: z.array(CatalogImageDescriptorSchema),
  isDigital: z.boolean(),
  isPromo: z.boolean(),
  language: textSchema.optional(),
  rarity: RaritySchema,
  releasedOn: z.iso.date().optional(),
  setCode: textSchema,
  setName: textSchema,
});
export type CatalogSelectedPrinting = z.infer<typeof CatalogSelectedPrintingSchema>;

export const CatalogSiblingPrintingSchema = z.object({
  collectorNumber: textSchema,
  id: idSchema,
  image: CatalogImageDescriptorSchema.optional(),
  isDigital: z.boolean(),
  isPromo: z.boolean(),
  language: textSchema.optional(),
  rarity: RaritySchema,
  releasedOn: z.iso.date().optional(),
  setCode: textSchema,
  setName: textSchema,
});
export type CatalogSiblingPrinting = z.infer<typeof CatalogSiblingPrintingSchema>;

export const CatalogFormatLegalitySchema = z.object({
  formatId: idSchema,
  formatName: textSchema,
  status: LegalityStatusSchema,
});
export type CatalogFormatLegality = z.infer<typeof CatalogFormatLegalitySchema>;

export const CatalogCardDetailSchema = z
  .object({
    card: CatalogCardIdentitySchema,
    legalities: z.array(CatalogFormatLegalitySchema),
    selectedPrinting: CatalogSelectedPrintingSchema,
    siblingPrintings: z.array(CatalogSiblingPrintingSchema),
  })
  .superRefine((detail, context) => {
    if (!detail.card.hasSharedIdentity && detail.card.id !== detail.selectedPrinting.id) {
      context.addIssue({
        code: "custom",
        message: "A standalone card identity must use its printing ID.",
        path: ["card", "id"],
      });
    }

    if (!detail.card.hasSharedIdentity && detail.siblingPrintings.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A standalone card cannot have sibling printings.",
        path: ["siblingPrintings"],
      });
    }

    if (
      detail.card.hasSharedIdentity &&
      !detail.siblingPrintings.some((printing) => printing.id === detail.selectedPrinting.id)
    ) {
      context.addIssue({
        code: "custom",
        message: "A shared printing set must include the selected printing.",
        path: ["siblingPrintings"],
      });
    }

    for (const [index, image] of detail.selectedPrinting.images.entries()) {
      if (image.printingId !== detail.selectedPrinting.id) {
        context.addIssue({
          code: "custom",
          message: "A selected-printing image must reference the selected printing.",
          path: ["selectedPrinting", "images", index, "printingId"],
        });
      }

      if (image.faceIndex >= detail.card.faces.length) {
        context.addIssue({
          code: "custom",
          message: "A selected-printing image must reference an existing card face.",
          path: ["selectedPrinting", "images", index, "faceIndex"],
        });
      }
    }

    const siblingIds = new Set<string>();

    for (const [index, printing] of detail.siblingPrintings.entries()) {
      if (siblingIds.has(printing.id)) {
        context.addIssue({
          code: "custom",
          message: "Sibling printings must be unique.",
          path: ["siblingPrintings", index, "id"],
        });
      }

      siblingIds.add(printing.id);

      if (printing.image && printing.image.printingId !== printing.id) {
        context.addIssue({
          code: "custom",
          message: "A sibling image must reference its sibling printing.",
          path: ["siblingPrintings", index, "image", "printingId"],
        });
      }
    }
  });
export type CatalogCardDetail = z.infer<typeof CatalogCardDetailSchema>;

const formatNames = new Map<string, string>([
  ["alchemy", "Alchemy"],
  ["brawl", "Brawl"],
  ["commander", "Commander"],
  ["duel", "Duel Commander"],
  ["explorer", "Explorer"],
  ["future", "Future"],
  ["gladiator", "Gladiator"],
  ["historic", "Historic"],
  ["legacy", "Legacy"],
  ["modern", "Modern"],
  ["oathbreaker", "Oathbreaker"],
  ["oldschool", "Old School"],
  ["pauper", "Pauper"],
  ["paupercommander", "Pauper Commander"],
  ["penny", "Penny"],
  ["pioneer", "Pioneer"],
  ["predh", "PreDH"],
  ["premodern", "Premodern"],
  ["standard", "Standard"],
  ["standardbrawl", "Standard Brawl"],
  ["timeless", "Timeless"],
  ["vintage", "Vintage"],
]);

/** Produces a stable display label while retaining the source format ID separately. */
export function getCatalogFormatName(formatId: string) {
  return (
    formatNames.get(formatId) ??
    formatId
      .replace(/([a-z\d])([A-Z])/g, "$1 $2")
      .split(/[-_\s]+/u)
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
      .join(" ")
  );
}

/**
 * Builds the renderer-safe card detail contract from validated Scryfall records.
 * Shared printing summaries always include the selected record exactly once.
 */
export function normalizeScryfallCardDetail(
  selectedCard: ScryfallCardDownload,
  relatedPrintings: readonly ScryfallCardDownload[] = [],
): CatalogCardDetail {
  const hasSharedIdentity = selectedCard.oracle_id != null;
  const siblingIds = new Set<string>();
  const relatedIncludesSelected = relatedPrintings.some(
    (printing) => printing.id === selectedCard.id,
  );
  const siblingPrintings = hasSharedIdentity
    ? (relatedIncludesSelected ? relatedPrintings : [selectedCard, ...relatedPrintings]).flatMap(
        (printing) => {
          if (printing.oracle_id !== selectedCard.oracle_id || siblingIds.has(printing.id)) {
            return [];
          }

          siblingIds.add(printing.id);
          return [
            normalizeSiblingPrinting(printing.id === selectedCard.id ? selectedCard : printing),
          ];
        },
      )
    : [];
  const card: CatalogCardIdentity = {
    colorIdentity: selectedCard.color_identity ?? [],
    faces: normalizeFaces(selectedCard),
    hasSharedIdentity,
    id: selectedCard.oracle_id ?? selectedCard.id,
    keywords: selectedCard.keywords ?? [],
    name: selectedCard.name,
  };
  if (selectedCard.cmc !== undefined) {
    card.manaValue = selectedCard.cmc;
  }
  const normalized = {
    card,
    legalities: Object.entries(selectedCard.legalities ?? {}).map(([formatId, status]) => ({
      formatId,
      formatName: getCatalogFormatName(formatId),
      status: status === "not_legal" ? "not-legal" : status,
    })),
    selectedPrinting: normalizeSelectedPrinting(selectedCard),
    siblingPrintings,
  };

  return CatalogCardDetailSchema.parse(normalized);
}

function normalizeFaces(card: ScryfallCardDownload): CatalogCardFace[] {
  if (!card.card_faces?.length) {
    return [
      normalizeFace({
        defense: card.defense,
        loyalty: card.loyalty,
        manaCost: card.mana_cost,
        name: card.name,
        oracleText: card.oracle_text,
        power: card.power,
        toughness: card.toughness,
        typeLine: card.type_line,
      }),
    ];
  }

  const fallbackNames = card.name.split(/\s+\/\/\s+/u);

  return card.card_faces.map((face, index) =>
    normalizeFace({
      defense: face.defense,
      loyalty: face.loyalty,
      manaCost: face.mana_cost,
      name: face.name ?? fallbackNames[index] ?? card.name,
      oracleText: face.oracle_text,
      power: face.power,
      toughness: face.toughness,
      typeLine: face.type_line ?? card.type_line,
    }),
  );
}

function normalizeFace(face: {
  defense?: null | string;
  loyalty?: null | string;
  manaCost?: null | string;
  name: string;
  oracleText?: null | string;
  power?: null | string;
  toughness?: null | string;
  typeLine: string;
}): CatalogCardFace {
  const defense = nonempty(face.defense);
  const loyalty = nonempty(face.loyalty);
  const manaCost = nonempty(face.manaCost);
  const oracleText = nonempty(face.oracleText);
  const power = nonempty(face.power);
  const toughness = nonempty(face.toughness);

  const normalized: CatalogCardFace = {
    name: face.name,
    typeLine: face.typeLine,
  };
  if (defense) normalized.defense = defense;
  if (loyalty) normalized.loyalty = loyalty;
  if (manaCost) normalized.manaCost = manaCost;
  if (oracleText) normalized.oracleText = oracleText;
  if (power) normalized.power = power;
  if (toughness) normalized.toughness = toughness;
  return normalized;
}

function normalizeSelectedPrinting(card: ScryfallCardDownload): CatalogSelectedPrinting {
  const artists = uniqueNonempty([
    card.artist,
    ...(card.artist ? [] : (card.card_faces?.map((face) => face.artist) ?? [])),
  ]);
  const finishes = card.finishes?.length ? card.finishes : undefined;
  const language = nonempty(card.lang);

  const printing: CatalogSelectedPrinting = {
    collectorNumber: card.collector_number,
    id: card.id,
    images: normalizeImages(card),
    isDigital: card.digital ?? false,
    isPromo: card.promo ?? false,
    rarity: RaritySchema.parse(card.rarity),
    setCode: card.set,
    setName: card.set_name,
  };
  if (artists.length) printing.artists = artists;
  if (finishes) printing.finishes = finishes;
  if (language) printing.language = language;
  if (card.released_at) printing.releasedOn = card.released_at;
  return printing;
}

function normalizeSiblingPrinting(card: ScryfallCardDownload): CatalogSiblingPrinting {
  const image = normalizeImages(card, ["grid"])[0];
  const language = nonempty(card.lang);

  const printing: CatalogSiblingPrinting = {
    collectorNumber: card.collector_number,
    id: card.id,
    isDigital: card.digital ?? false,
    isPromo: card.promo ?? false,
    rarity: RaritySchema.parse(card.rarity),
    setCode: card.set,
    setName: card.set_name,
  };
  if (image) printing.image = image;
  if (language) printing.language = language;
  if (card.released_at) printing.releasedOn = card.released_at;
  return printing;
}

function normalizeImages(
  card: ScryfallCardDownload,
  sizes: readonly CatalogImageSize[] = ["normal", "small"],
): CatalogImageDescriptor[] {
  const faceImages = card.card_faces?.some((face) => face.image_uris)
    ? card.card_faces.map((face) => face.image_uris)
    : [card.image_uris];

  return faceImages.flatMap((images, faceIndex) => {
    if (!images) {
      return [];
    }

    return sizes.flatMap((size) =>
      images[size] ? [{ faceIndex, printingId: card.id, size }] : [],
    );
  });
}

function nonempty(value: null | string | undefined) {
  return value?.trim() ? value : undefined;
}

function uniqueNonempty(values: readonly (null | string | undefined)[]) {
  return [...new Set(values.flatMap((value) => (nonempty(value) ? [value!] : [])))];
}
