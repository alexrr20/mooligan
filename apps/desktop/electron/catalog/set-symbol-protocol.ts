import {
  CatalogSetSymbolDescriptorSchema,
  type CatalogSetSymbolDescriptor,
} from "@mooligan/domain/spoilers";
import type { Session } from "electron";

import { readCachedCatalogSetSymbol, type CatalogSetSymbolCache } from "./set-symbol-cache.ts";

export const catalogSetSymbolScheme = "mooligan-set-symbol";

export function registerCatalogSetSymbolProtocol(
  targetSession: { protocol: Pick<Session["protocol"], "handle"> },
  cache: CatalogSetSymbolCache,
  resolveSource: (symbol: CatalogSetSymbolDescriptor) => Promise<string | null>,
) {
  targetSession.protocol.handle(catalogSetSymbolScheme, async (request) => {
    const symbol = parseCatalogSetSymbolUrl(request.url);
    if (!symbol) {
      return unavailableResponse(400);
    }

    let sourceUrl: string | null;
    try {
      sourceUrl = await resolveSource(symbol);
    } catch {
      return unavailableResponse(503);
    }
    if (!sourceUrl) {
      return unavailableResponse(404);
    }

    const cached = await cache.get(sourceUrl);
    if (cached.status === "unavailable") {
      return unavailableResponse(503);
    }

    try {
      return new Response(await readCachedCatalogSetSymbol(cached.path), {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "image/svg+xml",
        },
      });
    } catch {
      return unavailableResponse(503);
    }
  });
}

export function parseCatalogSetSymbolUrl(value: string): CatalogSetSymbolDescriptor | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== `${catalogSetSymbolScheme}:` ||
    url.hostname !== "catalog" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    parts.length !== 1
  ) {
    return null;
  }

  let setId: string;
  try {
    setId = decodeURIComponent(parts[0]);
  } catch {
    return null;
  }
  const parsed = CatalogSetSymbolDescriptorSchema.safeParse({ setId });
  return parsed.success ? parsed.data : null;
}

function unavailableResponse(status: number) {
  return new Response(null, { headers: { "Cache-Control": "no-store" }, status });
}
