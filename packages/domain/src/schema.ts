import { Schema } from "effect";

/** A value received at an I/O boundary before a schema decodes it into a domain type. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export const JsonValueSchema: Schema.Schema<JsonValue> = Schema.Union(
  Schema.Null,
  Schema.Boolean,
  Schema.JsonNumber,
  Schema.String,
  Schema.Array(Schema.suspend(() => JsonValueSchema)),
  Schema.Record({ key: Schema.String, value: Schema.suspend(() => JsonValueSchema) }),
);

/**
 * A struct that rejects excess properties wherever it is decoded or checked. The parse option also
 * applies to nested structs, so a strict contract is strict all the way down.
 */
export function StrictStruct<Fields extends Schema.Struct.Fields>(fields: Fields) {
  return Schema.Struct(fields).annotations({ parseOptions: { onExcessProperty: "error" } });
}

function isCalendarDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const isoDateTimePattern =
  /^(\d{4}-\d{2}-\d{2})T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

/** A calendar date in ISO 8601 `YYYY-MM-DD` form. */
export const IsoDateSchema = Schema.String.pipe(
  Schema.filter((value) => isoDatePattern.test(value) && isCalendarDate(value), {
    message: () => "Expected an ISO 8601 date.",
  }),
);

function isIsoDateTime(value: string, allowOffset: boolean) {
  const match = isoDateTimePattern.exec(value);
  return match?.[1] !== undefined && isCalendarDate(match[1]) && (allowOffset || match[2] === "Z");
}

/** An ISO 8601 date-time in UTC (`Z`). */
export const IsoDateTimeSchema = Schema.String.pipe(
  Schema.filter((value) => isIsoDateTime(value, false), {
    message: () => "Expected an ISO 8601 UTC date-time.",
  }),
);

/** An ISO 8601 date-time in UTC (`Z`) or with a `±hh:mm` offset. */
export const IsoOffsetDateTimeSchema = Schema.String.pipe(
  Schema.filter((value) => isIsoDateTime(value, true), {
    message: () => "Expected an ISO 8601 date-time.",
  }),
);

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** An absolute URL kept in its received text form. */
export const UrlSchema = Schema.String.pipe(
  Schema.filter((value) => parseUrl(value) !== null, { message: () => "Expected a URL." }),
);

export const HttpsUrlSchema = UrlSchema.pipe(
  Schema.filter((value) => parseUrl(value)?.protocol === "https:", {
    message: () => "Expected an HTTPS URL",
  }),
);

/** An RFC UUID, including the nil and max sentinel values. */
export const UuidSchema = Schema.String.pipe(
  Schema.pattern(
    /^(?:[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i,
    { identifier: "UUID" },
  ),
);

/** A random (version 4) UUID, used for secrets and per-session identities. */
export const UuidV4Schema = Schema.UUID.pipe(
  Schema.pattern(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i, {
    message: () => "Expected a version 4 UUID.",
  }),
);
