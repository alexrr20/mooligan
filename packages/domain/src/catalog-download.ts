import { Schema } from "effect";

import { ColorSchema, FinishSchema, ManaTypeSchema, RaritySchema } from "./catalog.ts";
import {
  HttpsUrlSchema,
  IsoDateSchema,
  IsoOffsetDateTimeSchema,
  StrictStruct,
  UrlSchema,
} from "./schema.ts";

const nonemptyTextSchema = Schema.NonEmptyString;

export const CatalogReleaseSchema = Schema.Struct({
  compressedSize: Schema.Int.pipe(Schema.positive()),
  downloadUrl: HttpsUrlSchema,
  updatedAt: IsoOffsetDateTimeSchema,
});
export type CatalogRelease = typeof CatalogReleaseSchema.Type;

export const ScryfallBulkDataSchema = Schema.Struct({
  compressed_size: Schema.Int.pipe(Schema.positive()),
  jsonl_download_uri: HttpsUrlSchema,
  type: Schema.Literal("default_cards"),
  updated_at: IsoOffsetDateTimeSchema,
});

export const ScryfallSetDownloadSchema = StrictStruct({
  arena_code: Schema.optional(nonemptyTextSchema),
  block: Schema.optional(nonemptyTextSchema),
  block_code: Schema.optional(nonemptyTextSchema),
  card_count: Schema.NonNegativeInt,
  code: nonemptyTextSchema,
  digital: Schema.Boolean,
  foil_only: Schema.Boolean,
  icon_svg_uri: HttpsUrlSchema,
  id: nonemptyTextSchema,
  mtgo_code: Schema.optional(nonemptyTextSchema),
  name: nonemptyTextSchema,
  nonfoil_only: Schema.Boolean,
  object: Schema.Literal("set"),
  parent_set_code: Schema.optional(nonemptyTextSchema),
  printed_size: Schema.optional(Schema.NullOr(Schema.NonNegativeInt)),
  released_at: Schema.optional(Schema.NullOr(IsoDateSchema)),
  scryfall_uri: HttpsUrlSchema,
  search_uri: HttpsUrlSchema,
  set_type: nonemptyTextSchema,
  tcgplayer_id: Schema.optional(Schema.Int.pipe(Schema.positive())),
  uri: HttpsUrlSchema,
});
export type ScryfallSetDownload = typeof ScryfallSetDownloadSchema.Type;

export const ScryfallSetListSchema = StrictStruct({
  data: Schema.Array(ScryfallSetDownloadSchema).pipe(Schema.minItems(1)),
  has_more: Schema.Literal(false),
  object: Schema.Literal("list"),
});
export type ScryfallSetList = typeof ScryfallSetListSchema.Type;

const optionalUrlSchema = Schema.optional(Schema.NullOr(UrlSchema));
const ScryfallImageUrisSchema = Schema.Struct({
  art_crop: optionalUrlSchema,
  grid: optionalUrlSchema,
  normal: optionalUrlSchema,
  small: optionalUrlSchema,
  thumb: optionalUrlSchema,
});

const optionalTextSchema = Schema.optional(Schema.NullOr(Schema.String));
const ScryfallCardFaceDownloadSchema = Schema.Struct({
  artist: optionalTextSchema,
  defense: optionalTextSchema,
  flavor_text: optionalTextSchema,
  image_uris: Schema.optional(Schema.NullOr(ScryfallImageUrisSchema)),
  loyalty: optionalTextSchema,
  mana_cost: optionalTextSchema,
  name: Schema.optional(nonemptyTextSchema),
  oracle_text: optionalTextSchema,
  power: optionalTextSchema,
  toughness: optionalTextSchema,
  type_line: Schema.optional(nonemptyTextSchema),
});

const ScryfallLegalityStatusSchema = Schema.Literal("legal", "not_legal", "restricted", "banned");

const scryfallCardFields = {
  artist: optionalTextSchema,
  card_faces: Schema.optional(Schema.Array(ScryfallCardFaceDownloadSchema)),
  collector_number: nonemptyTextSchema,
  color_identity: Schema.optional(Schema.Array(ColorSchema)),
  cmc: Schema.optional(Schema.Finite.pipe(Schema.nonNegative())),
  defense: optionalTextSchema,
  digital: Schema.optional(Schema.Boolean),
  finishes: Schema.optional(Schema.Array(FinishSchema)),
  flavor_text: optionalTextSchema,
  id: nonemptyTextSchema,
  image_uris: Schema.optional(Schema.NullOr(ScryfallImageUrisSchema)),
  keywords: Schema.optional(Schema.Array(nonemptyTextSchema)),
  layout: Schema.optional(nonemptyTextSchema),
  lang: Schema.optional(Schema.NullOr(nonemptyTextSchema)),
  legalities: Schema.optional(
    Schema.Record({ key: nonemptyTextSchema, value: ScryfallLegalityStatusSchema }).annotations({
      parseOptions: { onExcessProperty: "error" },
    }),
  ),
  loyalty: optionalTextSchema,
  mana_cost: optionalTextSchema,
  name: nonemptyTextSchema,
  object: Schema.Literal("card"),
  oracle_text: optionalTextSchema,
  oracle_id: Schema.optional(Schema.NullOr(nonemptyTextSchema)),
  power: optionalTextSchema,
  produced_mana: Schema.optional(
    Schema.Array(Schema.Union(ManaTypeSchema, Schema.Literal("2", "T"))),
  ),
  promo: Schema.optional(Schema.Boolean),
  rarity: RaritySchema,
  released_at: Schema.optional(Schema.NullOr(IsoDateSchema)),
  set: nonemptyTextSchema,
  set_id: nonemptyTextSchema,
  set_name: nonemptyTextSchema,
  toughness: optionalTextSchema,
  type_line: Schema.optional(nonemptyTextSchema),
};

/** A Scryfall card whose type line falls back to the distinct type lines of its faces. */
export const ScryfallCardDownloadSchema = Schema.transform(
  Schema.Struct(scryfallCardFields),
  Schema.typeSchema(
    Schema.Struct({
      ...scryfallCardFields,
      type_line: Schema.String.pipe(
        Schema.minLength(1, { message: () => "A card or card face must provide a type line" }),
      ),
    }),
  ),
  {
    strict: true,
    decode: (card) => ({
      ...card,
      type_line:
        card.type_line ??
        [
          ...new Set(
            card.card_faces?.flatMap((face) => (face.type_line ? [face.type_line] : [])) ?? [],
          ),
        ].join(" // "),
    }),
    encode: (card) => card,
  },
);

export type ScryfallCardDownload = typeof ScryfallCardDownloadSchema.Type;
