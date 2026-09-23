import { UuidSchema } from "@mooligan/domain/schema";
import { ipcMain } from "electron";
import { Schema } from "effect";

import { assertTrustedSender } from "../ipc-security.ts";
import type { CatalogService } from "../catalog/service.ts";
import type { PriceService } from "./service.ts";

export function registerPriceIpc(
  prices: PriceService,
  readPrinting: CatalogService["printingDetail"],
) {
  ipcMain.handle("prices:exchange-rates", (event) => {
    assertTrustedSender(event);
    return prices.exchangeRates();
  });
  ipcMain.handle("prices:status", (event) => {
    assertTrustedSender(event);
    return prices.status();
  });
  ipcMain.handle("prices:refresh", (event) => {
    assertTrustedSender(event);
    return prices.refresh(true);
  });
  ipcMain.handle("prices:printing", async (event, value) => {
    assertTrustedSender(event);
    const printingId = Schema.decodeUnknownSync(UuidSchema)(value);
    const result = await readPrinting(printingId);
    if (!result || result.status !== "visible" || result.detail.selectedPrinting.isDigital) {
      return { prices: [], snapshot: prices.status().snapshot };
    }
    return prices.read(printingId);
  });
}
