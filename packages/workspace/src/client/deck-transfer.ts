import type { Finish } from "@mooligan/domain/catalog";
import type { CatalogListPage, CatalogListRequest } from "@mooligan/domain/catalog-search";
import { deckSectionLabels, deckSections, type DeckSection } from "@mooligan/domain/decks";
import type { CatalogPrintingResult } from "@mooligan/domain/spoilers";
import { Schema } from "effect";

import { NewDeckEntrySchema, type DeckEntry, type NewDeckEntry } from "../deck-contract.ts";
import { FinishSchema } from "../primitives.ts";

const decodeNewEntry = Schema.decodeSync(NewDeckEntrySchema);
const isFinish = Schema.is(FinishSchema);

type ImportLine = {
  line: number;
  name: string;
  quantity: number;
  section: DeckSection;
  printingId?: string;
  finish?: Finish;
  setCode?: string;
  collectorNumber?: string;
};

export type DeckImportResult = {
  entries: NewDeckEntry[];
  errors: string[];
  warnings: string[];
};

const sectionNames = new Map<string, DeckSection>([
  ["deck", "mainboard"],
  ["main", "mainboard"],
  ["main deck", "mainboard"],
  ["mainboard", "mainboard"],
  ["sideboard", "sideboard"],
  ["commander", "commander"],
  ["commanders", "commander"],
  ["companion", "companion"],
  ["maybeboard", "maybeboard"],
  ["considering", "maybeboard"],
]);

export function parseDeckText(text: string) {
  const lines: ImportLine[] = [];
  const errors: string[] = [];
  if (text.length > 1_000_000 || text.split("\n").length > 10_000)
    return { lines, errors: ["Import at most 10,000 lines and 1 MB of text."] };
  let section: DeckSection = "mainboard";
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    let value = raw.trim();
    if (!value || value.startsWith("#")) continue;
    const header = value
      .replace(/^\/\/\s*|^\[|\]$|:$/gu, "")
      .trim()
      .toLowerCase();
    const nextSection = sectionNames.get(header);
    if (nextSection) {
      section = nextSection;
      continue;
    }
    if (value.startsWith("//")) continue;
    const sideboard = /^SB:\s*/iu.test(value);
    if (sideboard) value = value.replace(/^SB:\s*/iu, "");
    const match = /^(\d+)x?\s+(.+)$/u.exec(value);
    if (!match?.[1] || !match[2]) {
      errors.push(`Line ${index + 1}: use a quantity followed by a card name.`);
      continue;
    }
    let name = match[2];
    const printingId = /\s*\[printing:([^\]\s]+)\]/u.exec(name)?.[1];
    const finishToken = /\s*\[finish:([^\]]+)\]/u.exec(name)?.[1];
    const marker = /\s+\*([FE])\*$/u.exec(name)?.[1];
    name = name
      .replace(/\s*\[(?:printing|finish):[^\]]+\]/gu, "")
      .replace(/\s+\*[FE]\*$/u, "")
      .trim();
    const finish = finishToken ?? (marker === "F" ? "foil" : marker === "E" ? "etched" : undefined);
    if (finish !== undefined && !isFinish(finish)) {
      errors.push(`Line ${index + 1}: unknown finish.`);
      continue;
    }
    const edition = /\s+\(([^)]+)\)\s+(\S+)$/u.exec(name);
    if (edition) name = name.slice(0, edition.index).trim();
    const quantity = Number(match[1]);
    if (
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > 1_000_000 ||
      (!name && !printingId)
    ) {
      errors.push(`Line ${index + 1}: enter a card and a quantity between 1 and 1,000,000.`);
      continue;
    }
    lines.push({
      line: index + 1,
      name,
      quantity,
      section: sideboard ? "sideboard" : section,
      printingId,
      finish,
      setCode: edition?.[1],
      collectorNumber: edition?.[2],
    });
  }
  if (!lines.length && !errors.length) errors.push("Enter at least one card to import.");
  return { lines, errors };
}

export async function resolveDeckText(
  text: string,
  catalog: {
    detail: (printingId: string) => Promise<CatalogPrintingResult | null>;
    list: (request: CatalogListRequest) => Promise<CatalogListPage>;
  },
): Promise<DeckImportResult> {
  const parsed = parseDeckText(text);
  const result: DeckImportResult = { entries: [], errors: [...parsed.errors], warnings: [] };
  if (parsed.errors.length) return result;
  const resolved = new Map<string, Pick<DeckEntry, "printingId" | "finish">>();
  for (const line of parsed.lines) {
    try {
      const key = JSON.stringify([
        line.printingId,
        line.name,
        line.setCode,
        line.collectorNumber,
        line.finish,
      ]);
      let card = resolved.get(key);
      if (!card) {
        let printingId = line.printingId;
        if (!printingId) {
          const edition = line.setCode
            ? ` set:${quote(line.setCode)} cn:${quote(line.collectorNumber ?? "")}`
            : "";
          const finish = line.finish ? ` finish:${line.finish}` : "";
          let page = await catalog.list({
            query: `!${quote(line.name)}${edition}${finish}`,
            limit: 250,
            includeDigital: true,
          });
          if (!page.cards.length && !page.queryError)
            page = await catalog.list({
              query: `name:${quote(line.name)}${edition}${finish}`,
              limit: 250,
              includeDigital: true,
            });
          const matches = page.cards.filter(
            (card) =>
              card.name.toLowerCase() === line.name.toLowerCase() ||
              card.name.split(" // ")[0]?.toLowerCase() === line.name.toLowerCase(),
          );
          printingId = matches.find((card) => !card.isDigital)?.id ?? matches[0]?.id;
          if (page.queryError || !printingId)
            throw new Error(
              "No matching visible printing in the local catalog. Check the name, set, and collector number.",
            );
        }
        const detail = await catalog.detail(printingId).catch((cause: unknown) => {
          // Exact IDs from a deck export remain useful before a catalog is installed.
          if (!line.printingId) throw cause;
          return null;
        });
        let finish = line.finish ?? "nonfoil";
        if (detail?.status === "visible") {
          finish =
            line.finish ??
            detail.detail.selectedPrinting.finishes?.find((value) => value === "nonfoil") ??
            detail.detail.selectedPrinting.finishes?.[0] ??
            "nonfoil";
          if (!detail.detail.selectedPrinting.finishes?.includes(finish))
            throw new Error("The printing does not support this finish.");
        } else {
          result.warnings.push(
            `Line ${line.line}: kept the exact printing reference. Its details are ${detail?.status === "protected" ? "protected" : "unavailable in this catalog"}.`,
          );
        }
        card = { printingId, finish };
        resolved.set(key, card);
      }
      result.entries.push(
        decodeNewEntry({ ...card, quantity: line.quantity, section: line.section }),
      );
    } catch (cause) {
      result.errors.push(
        `Line ${line.line}: ${cause instanceof Error ? cause.message : "The card could not be read."}`,
      );
    }
  }
  return result;
}

export function exportDeckText(
  entries: readonly DeckEntry[],
  printings: ReadonlyMap<string, CatalogPrintingResult | null>,
) {
  return deckSections
    .map((value) => {
      const lines = entries
        .filter(({ section }) => section === value)
        .map((entry) => {
          const result = printings.get(entry.printingId);
          const detail = result?.status === "visible" ? result.detail : null;
          const name = detail
            ? `${detail.card.name} (${detail.selectedPrinting.setCode.toUpperCase()}) ${detail.selectedPrinting.collectorNumber} `
            : "";
          return `${entry.quantity} ${name}[printing:${entry.printingId}] [finish:${entry.finish}]`;
        });
      return lines.length ? `${deckSectionLabels[value]}\n${lines.join("\n")}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
}

function quote(value: string) {
  return `"${value.replace(/\\/gu, "\\\\").replace(/"/gu, '\\"')}"`;
}
