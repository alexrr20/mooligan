import { File, Paths } from "expo-file-system";
import { gzipText } from "./gzip-lines";
import { JSONParser } from "@streamparser/json";
import { UuidSchema, IsoDateSchema, JsonValueSchema } from "@mooligan/domain/schema";
import { Schema } from "effect";
import type { PriceFeedSource } from "@mooligan/catalog/price-import";

// Read bounded chunks from disk so neither compressed bulk feed lives in JS memory.
export async function* fileChunks(file: File) {
  const handle = file.open();
  try {
    while (true) {
      const bytes = handle.readBytes(16 * 1024);
      if (!bytes.length) break;
      yield bytes;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    handle.close();
  }
}

const decodeMeta = Schema.decodeUnknownSync(
  Schema.Struct({ date: IsoDateSchema, version: Schema.String.pipe(Schema.startsWith("5.")) }),
);
const decodeCardUuid = Schema.decodeUnknownSync(UuidSchema);
const decodeCard = Schema.decodeUnknownSync(JsonValueSchema);

export const downloadPriceFeed: PriceFeedSource = async (name, onCard) => {
  const file = new File(Paths.cache, `${name}.json.gz`);
  try {
    await File.downloadFileAsync(`https://mtgjson.com/api/v5/${name}.json.gz`, file, {
      idempotent: true,
    });
    let date: string | undefined;
    let count = 0;
    const parser = new JSONParser({ paths: ["$.meta", "$.data.*"], keepStack: false });
    parser.onValue = ({ key, value }) => {
      if (key === "meta") date = decodeMeta(value).date;
      else {
        onCard(decodeCardUuid(key), decodeCard(value));
        count++;
      }
    };
    for await (const text of gzipText(fileChunks(file))) parser.write(text);
    if (!parser.isEnded) parser.end();
    if (!date || !count) throw new Error("MTGJSON returned an empty or incomplete file.");
    return date;
  } finally {
    if (file.exists) file.delete();
  }
};
