import { readFile } from "node:fs/promises";

import {
  CatalogImageDescriptorSchema,
  type CatalogImageDescriptor,
} from "@mooligan/domain/catalog-detail";
import type { Session } from "electron";

import type { CatalogImageCache } from "./image-cache";

export const catalogImageScheme = "mooligan-image";

export type AuthorizedCatalogImageSource = {
  isCurrent: () => boolean;
  sourceUrl: string;
};

export function registerCatalogImageProtocol(
  targetSession: { protocol: Pick<Session["protocol"], "handle"> },
  cache: CatalogImageCache,
  resolveSource: (image: CatalogImageDescriptor) => Promise<AuthorizedCatalogImageSource | null>,
) {
  targetSession.protocol.handle(catalogImageScheme, async (request) => {
    const image = parseCatalogImageUrl(request.url);

    if (!image) {
      return unavailableResponse(400);
    }

    let source: AuthorizedCatalogImageSource | null;
    try {
      source = await resolveSource(image);
    } catch {
      return unavailableResponse(503);
    }

    if (!source) {
      return unavailableResponse(404);
    }

    const cached = await cache.get(source.sourceUrl);
    if (cached.status === "unavailable") {
      return unavailableResponse(503);
    }

    try {
      const bytes = new Uint8Array(await readFile(cached.path));
      if (!source.isCurrent()) {
        return unavailableResponse(404);
      }

      return new Response(bytes, {
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": cached.contentType,
        },
      });
    } catch {
      return unavailableResponse(503);
    }
  });
}

export function parseCatalogImageUrl(value: string): CatalogImageDescriptor | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (
    url.protocol !== `${catalogImageScheme}:` ||
    url.hostname !== "catalog" ||
    url.port !== "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    parts.length !== 3
  ) {
    return null;
  }

  let printingId: string;
  try {
    printingId = decodeURIComponent(parts[0]);
  } catch {
    return null;
  }

  if (!/^(0|[1-9]\d*)$/.test(parts[1])) {
    return null;
  }

  const parsed = CatalogImageDescriptorSchema.safeParse({
    faceIndex: Number(parts[1]),
    printingId,
    size: parts[2],
  });
  return parsed.success ? parsed.data : null;
}

function unavailableResponse(status: number) {
  return new Response(null, {
    headers: { "Cache-Control": "no-store" },
    status,
  });
}
