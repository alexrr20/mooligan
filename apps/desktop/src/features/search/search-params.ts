import { Option, Schema } from "effect";

/** Invalid URL fields are omitted without discarding the other filters. */
export function optionalSearchParam<A, I>(schema: Schema.Schema<A, I>) {
  return Schema.optionalToOptional(Schema.Unknown, Schema.typeSchema(schema), {
    decode: (value) => Option.flatMap(value, Schema.decodeUnknownOption(schema)),
    encode: (value) => value,
  });
}

export function searchText(maxLength: number) {
  return Schema.transform(
    Schema.String,
    Schema.Trimmed.pipe(Schema.minLength(1), Schema.maxLength(maxLength)),
    { decode: (value) => value.trim().slice(0, maxLength).trim(), encode: (value) => value },
  );
}
