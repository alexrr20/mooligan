import type { Protocol } from "electron";

import { AUTH_PROTOCOL } from "./auth/service.ts";
import { catalogImageScheme } from "./catalog/image-protocol.ts";

export function registerDesktopSchemes(protocol: Pick<Protocol, "registerSchemesAsPrivileged">) {
  protocol.registerSchemesAsPrivileged([
    {
      privileges: { secure: true, standard: false },
      scheme: AUTH_PROTOCOL,
    },
    {
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
      },
      scheme: catalogImageScheme,
    },
  ]);
}
