import { DecodeUTF8, Gunzip } from "fflate";

export async function* gzipText(chunks: AsyncIterable<Uint8Array>) {
  let text = "";
  const decoder = new DecodeUTF8((chunk) => {
    text += chunk;
  });
  const unzip = new Gunzip((chunk, final) => decoder.push(chunk, final));
  for await (const bytes of chunks) {
    unzip.push(bytes, false);
    if (text) {
      yield text;
      text = "";
    }
  }
  unzip.push(new Uint8Array(), true);
  if (text) yield text;
}

export async function* catalogLines(chunks: AsyncIterable<Uint8Array>) {
  let pending = "";
  for await (const text of gzipText(chunks)) {
    const lines = (pending + text).split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 2_000_000) throw new Error("A catalog record is too large.");
      if (line.trim()) yield line;
    }
    if (pending.length > 2_000_000) throw new Error("A catalog record is too large.");
  }
  if (pending.trim()) yield pending;
}
