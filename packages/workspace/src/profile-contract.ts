import { Schema } from "effect";

const PrintingId = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(128));

export const profileSettingsSchema = Schema.Struct({
  bannerPrintingId: Schema.NullOr(PrintingId),
  featuredPrintingIds: Schema.Array(Schema.NullOr(PrintingId)).pipe(
    Schema.itemsCount(4),
    Schema.filter(
      (ids) => {
        const selected = ids.filter((id) => id !== null);
        return new Set(selected).size === selected.length;
      },
      { message: () => "Choose a different printing for each featured card." },
    ),
  ),
});

export type ProfileSettings = typeof profileSettingsSchema.Type;

export const emptyProfile: ProfileSettings = {
  bannerPrintingId: null,
  featuredPrintingIds: [null, null, null, null],
};
