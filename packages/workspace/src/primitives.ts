import { Schema } from "effect";

/** Opaque identifiers are stored exactly as issued and are never trimmed. */
export const IdentifierSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(128),
  Schema.trimmed({ message: () => "Identifiers cannot start or end with whitespace." }),
);

/** UTC instants in `Date.prototype.toISOString()` form, so they also sort as text. */
export const TimestampSchema = Schema.String.pipe(
  Schema.filter(
    (value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
    { message: () => "Timestamps must use the UTC ISO 8601 form with milliseconds." },
  ),
);

/** User-entered text is trimmed at the mutation boundary and stored canonical. */
export function trimmedTextSchema(maxLength: number) {
  return Schema.String.pipe(Schema.trimmed(), Schema.minLength(1), Schema.maxLength(maxLength));
}
