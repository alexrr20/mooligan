import { posix, win32 } from "node:path";

const applicationDirectory = "Mooligan";

/** Electron has no cross-platform `cache` getPath key, so follow each OS cache convention. */
export function resolveCatalogImageCacheDirectory(
  homeDirectory: string,
  platform: NodeJS.Platform = process.platform,
  environment: Readonly<NodeJS.ProcessEnv> = process.env,
) {
  const paths = platform === "win32" ? win32 : posix;
  let cacheRoot: string;

  if (platform === "darwin") {
    cacheRoot = paths.join(homeDirectory, "Library", "Caches");
  } else if (platform === "win32") {
    const localAppData = environment.LOCALAPPDATA;
    cacheRoot =
      localAppData && paths.isAbsolute(localAppData)
        ? localAppData
        : paths.join(homeDirectory, "AppData", "Local");
  } else {
    const xdgCacheHome = environment.XDG_CACHE_HOME;
    cacheRoot =
      xdgCacheHome && paths.isAbsolute(xdgCacheHome)
        ? xdgCacheHome
        : paths.join(homeDirectory, ".cache");
  }

  return paths.join(
    cacheRoot,
    platform === "darwin" || platform === "win32"
      ? applicationDirectory
      : applicationDirectory.toLowerCase(),
    "catalog-images",
  );
}
