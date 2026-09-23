import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { parentPort, workerData } from "node:worker_threads";

import { Schema } from "effect";

import { importPrices } from "./import.ts";

const { path } = Schema.decodeUnknownSync(Schema.Struct({ path: Schema.NonEmptyString }))(
  workerData,
);
const stagingPath = `${path}.incoming`;
try {
  await rm(stagingPath, { force: true });
  const snapshot = await importPrices(
    path,
    stagingPath,
    async (file) => {
      const response = await fetch(`https://mtgjson.com/api/v5/${file}.json.gz`, {
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": "Mooligan/0.0.0 (https://github.com/alexrr20/mooligan)",
        },
        signal: AbortSignal.timeout(10 * 60_000),
      });
      if (!response.ok || !response.body)
        throw new Error(`MTGJSON returned HTTP ${response.status}.`);
      const reader = response.body.getReader();
      return Readable.from(
        (async function* () {
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) return;
              yield chunk.value;
            }
          } finally {
            await reader.cancel();
            reader.releaseLock();
          }
        })(),
      );
    },
    (phase) => parentPort?.postMessage({ phase }),
  );
  parentPort?.postMessage({ snapshot });
} finally {
  await rm(stagingPath, { force: true });
}
