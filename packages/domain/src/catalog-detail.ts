import { Schema } from "effect";
import type { Mutable } from "effect/Types";

import {
  ColorSchema,
  FinishSchema,
  LegalityStatusSchema,
  ManaTypeSchema,
  RaritySchema,
} from "./catalog.ts";
import type { ScryfallCardDownload } from "./catalog-download.ts";
import { IsoDateSchema } from "./schema.ts";

const idSchema = Schema.NonEmptyString;
const textSchema = Schema.NonEmptyString;

export const CatalogCardFaceSchema = Schema.Struct({
  defense: Schema.optional(textSchema),
  loyalty: Schema.optional(textSchema),
  manaCost: Schema.optional(textSchema),
  name: textSchema,
  oracleText: Schema.optional(textSchema),
  power: Schema.optional(textSchema),
  toughness: Schema.optional(textSchema),
  typeLine: textSchema,
});
export type CatalogCardFace = typeof CatalogCardFaceSchema.Type;

export const CatalogCardIdentitySchema = Schema.Struct({
  colorIdentity: Schema.Array(ColorSchema),
  faces: Schema.Array(CatalogCardFaceSchema).pipe(Schema.minItems(1)),
  hasSharedIdentity: Schema.Boolean,
  id: idSchema,
  keywords: Schema.Array(textSchema),
  layout: Schema.optional(textSchema),
  manaValue: Schema.optional(Schema.Finite.pipe(Schema.nonNegative())),
  name: textSchema,
  producedMana: Schema.Array(ManaTypeSchema),
});
export type CatalogCardIdentity = typeof CatalogCardIdentitySchema.Type;

export const CatalogImageSizeSchema = Schema.Literal(
  "art_crop",
  "grid",
  "normal",
  "small",
  "thumb",
);
export type CatalogImageSize = typeof CatalogImageSizeSchema.Type;

export const CatalogImageDescriptorSchema = Schema.Struct({
  faceIndex: Schema.NonNegativeInt,
  printingId: idSchema,
  size: CatalogImageSizeSchema,
});
export type CatalogImageDescriptor = typeof CatalogImageDescriptorSchema.Type;

export const CatalogSelectedPrintingSchema = Schema.Struct({
  artists: Schema.optional(Schema.Array(textSchema).pipe(Schema.minItems(1))),
  collectorNumber: textSchema,
  finishes: Schema.optional(Schema.Array(FinishSchema).pipe(Schema.minItems(1))),
  id: idSchema,
  images: Schema.Array(CatalogImageDescriptorSchema),
  isDigital: Schema.Boolean,
  isPromo: Schema.Boolean,
  language: Schema.optional(textSchema),
  rarity: RaritySchema,
  releasedOn: Schema.optional(IsoDateSchema),
  setCode: textSchema,
  setName: textSchema,
});
export type CatalogSelectedPrinting = typeof CatalogSelectedPrintingSchema.Type;

export const CatalogSiblingPrintingSchema = Schema.Struct({
  collectorNumber: textSchema,
  id: idSchema,
  image: Schema.optional(CatalogImageDescriptorSchema),
  isDigital: Schema.Boolean,
  isPromo: Schema.Boolean,
  language: Schema.optional(textSchema),
  rarity: RaritySchema,
  releasedOn: Schema.optional(IsoDateSchema),
  setCode: textSchema,
  setName: textSchema,
});
export type CatalogSiblingPrinting = typeof CatalogSiblingPrintingSchema.Type;

export const CatalogFormatLegalitySchema = Schema.Struct({
  formatId: idSchema,
  formatName: textSchema,
  status: LegalityStatusSchema,
});
export type CatalogFormatLegality = typeof CatalogFormatLegalitySchema.Type;

export const CatalogCardDetailSchema = Schema.Struct({
  card: CatalogCardIdentitySchema,
  legalities: Schema.Array(CatalogFormatLegalitySchema),
  selectedPrinting: CatalogSelectedPrintingSchema,
  siblingPrintings: Schema.Array(CatalogSiblingPrintingSchema),
}).pipe(
  Schema.filter((detail) => {
    const issues: Schema.FilterIssue[] = [];

    if (!detail.card.hasSharedIdentity && detail.card.id !== detail.selectedPrinting.id) {
      issues.push({
        message: "A standalone card identity must use its printing ID.",
        path: ["card", "id"],
      });
    }

    if (!detail.card.hasSharedIdentity && detail.siblingPrintings.length > 0) {
      issues.push({
        message: "A standalone card cannot have sibling printings.",
        path: ["siblingPrintings"],
      });
    }

    if (
      detail.card.hasSharedIdentity &&
      !detail.siblingPrintings.some((printing) => printing.id === detail.selectedPrinting.id)
    ) {
      issues.push({
        message: "A shared printing set must include the selected printing.",
        path: ["siblingPrintings"],
      });
    }

    for (const [index, image] of detail.selectedPrinting.images.entries()) {
      if (image.printingId !== detail.selectedPrinting.id) {
        issues.push({
          message: "A selected-printing image must reference the selected printing.",
          path: ["selectedPrinting", "images", index, "printingId"],
        });
      }

      if (image.faceIndex >= detail.card.faces.length) {
        issues.push({
          message: "A selected-printing image must reference an existing card face.",
          path: ["selectedPrinting", "images", index, "faceIndex"],
        });
      }
    }

    const siblingIds = new Set<string>();

    for (const [index, printing] of detail.siblingPrintings.entries()) {
      if (siblingIds.has(printing.id)) {
        issues.push({
          message: "Sibling printings must be unique.",
          path: ["siblingPrintings", index, "id"],
        });
      }

      siblingIds.add(printing.id);

      if (printing.image && printing.image.printingId !== printing.id) {
        issues.push({
          message: "A sibling image must reference its sibling printing.",
          path: ["siblingPrintings", index, "image", "printingId"],
        });
      }
    }

    return issues;
  }),
);
export type CatalogCardDetail = typeof CatalogCardDetailSchema.Type;

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
  const card: Mutable<CatalogCardIdentity> = {
    colorIdentity: selectedCard.color_identity ?? [],
    faces: normalizeFaces(selectedCard),
    hasSharedIdentity,
    id: selectedCard.oracle_id ?? selectedCard.id,
    keywords: selectedCard.keywords ?? [],
    name: selectedCard.name,
    producedMana: (selectedCard.produced_mana ?? []).filter(Schema.is(ManaTypeSchema)),
  };
  if (selectedCard.layout) card.layout = selectedCard.layout;
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

  return Schema.decodeUnknownSync(CatalogCardDetailSchema)(normalized);
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

  const normalized: Mutable<CatalogCardFace> = {
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

  const printing: Mutable<CatalogSelectedPrinting> = {
    collectorNumber: card.collector_number,
    id: card.id,
    images: normalizeImages(card),
    isDigital: card.digital ?? false,
    isPromo: card.promo ?? false,
    rarity: card.rarity,
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

  const printing: Mutable<CatalogSiblingPrinting> = {
    collectorNumber: card.collector_number,
    id: card.id,
    isDigital: card.digital ?? false,
    isPromo: card.promo ?? false,
    rarity: card.rarity,
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
  sizes: readonly CatalogImageSize[] = ["normal", "small", "art_crop"],
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
