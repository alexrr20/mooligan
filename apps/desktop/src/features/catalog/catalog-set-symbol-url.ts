import type { CatalogSetSymbolDescriptor } from "@mooligan/domain/spoilers";

export function catalogSetSymbolUrl(symbol: CatalogSetSymbolDescriptor) {
  return `mooligan-set-symbol://catalog/${encodeURIComponent(symbol.setId)}`;
}

export function catalogSetSymbolAccessibleName(code: string) {
  return `${code.toUpperCase()} set symbol`;
}

export function catalogSetSymbolFallback(code: string) {
  return code.slice(0, 3).toUpperCase();
}
