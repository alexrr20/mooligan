import { gzipSync, strToU8 } from "fflate";
import { expect, test } from "vite-plus/test";
import { catalogLines } from "./gzip-lines";

async function* chunks(bytes: Uint8Array) {
  for (let index = 0; index < bytes.length; index += 7) yield bytes.subarray(index, index + 7);
}
async function read(bytes: Uint8Array) {
  const lines: string[] = [];
  for await (const line of catalogLines(chunks(bytes))) lines.push(line);
  return lines;
}
test("mobile bulk import preserves UTF-8 and records split across compressed chunks", async () => {
  const records = ['{"name":"Éowyn, Shieldmaiden"}', '{"name":"火 // 氷"}'];
  expect(await read(gzipSync(strToU8(`\n${records.join("\n")}\n\n`)))).toEqual(records);
  expect(await read(gzipSync(strToU8(records.join("\n"))))).toEqual(records);
});
test("mobile bulk import rejects truncated gzip data and oversized catalog records", async () => {
  const compressed = gzipSync(strToU8('{"name":"Lightning Bolt"}\n'));
  await expect(read(compressed.subarray(0, 12))).rejects.toThrow();
  await expect(read(gzipSync(strToU8("x".repeat(2_000_001))))).rejects.toThrow("too large");
});
