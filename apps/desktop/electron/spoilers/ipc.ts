import { SpoilerPolicySchema, SpoilerTargetIdSchema } from "@mooligan/domain/spoilers";
import { ipcMain } from "electron";

import { resolveCatalogRootSetId } from "../catalog/ipc";
import { assertTrustedSender } from "../ipc-security";
import { publishRendererEvent } from "../windows";
import { runForUnchangedRevision, type MutationQueue } from "../workspace/mutations";
import type { WorkspaceManager } from "../workspace/store";
import { releaseProtectionTarget, type SpoilerService } from "./service";

export function registerSpoilerIpc(
  workspace: WorkspaceManager,
  spoilers: SpoilerService,
  mutations: MutationQueue,
) {
  const unsubscribe = spoilers.subscribe((state) => {
    publishRendererEvent("spoilers:changed", state);
  });

  ipcMain.handle("spoilers:read", (event) => {
    assertTrustedSender(event);
    return spoilers.snapshot();
  });
  ipcMain.handle("spoilers:set-policy", (event, value) => {
    assertTrustedSender(event);
    const policy = SpoilerPolicySchema.parse(value);
    return mutations.run(() => {
      const state = spoilers.setPolicy(policy);
      publishRendererEvent("preferences:changed", workspace.readPreferences());
      return state;
    });
  });
  ipcMain.handle("spoilers:reveal-printing", (event, value) => {
    assertTrustedSender(event);
    const printingId = SpoilerTargetIdSchema.parse(value);
    return mutations.run(async () => {
      const rootSetId = await runForUnchangedRevision(
        () => workspace.readSpoilerState().revision,
        () => resolveCatalogRootSetId(printingId),
      );

      if (!rootSetId) {
        throw new Error("This printing is not present in the installed catalog.");
      }

      return spoilers.revealPrinting(printingId);
    });
  });
  ipcMain.handle("spoilers:protect-printing", (event, value) => {
    assertTrustedSender(event);
    const printingId = SpoilerTargetIdSchema.parse(value);
    return mutations.run(async () => {
      const rootSetId = await resolveOptionalCatalogRootSetId(printingId);
      const current = workspace.readSpoilerState();
      const active = current.activePrintingIds.includes(printingId);

      if (current.policy === "show") {
        throw new Error('Turn off "Always show previews" before protecting one printing.');
      }
      if (!active && !rootSetId) {
        throw new Error("This printing is not present in the installed catalog.");
      }
      if (rootSetId && current.activeRootSetIds.includes(rootSetId)) {
        throw new Error("Protect this release before protecting one printing from it.");
      }

      return spoilers.protectPrinting(printingId);
    });
  });
  ipcMain.handle("spoilers:reveal-release", (event, value) => {
    assertTrustedSender(event);
    const targetId = SpoilerTargetIdSchema.parse(value);
    return mutations.run(async () => {
      const rootSetId = await runForUnchangedRevision(
        () => workspace.readSpoilerState().revision,
        () => requireCatalogRootSetId(targetId),
      );
      return spoilers.revealRelease(rootSetId);
    });
  });
  ipcMain.handle("spoilers:protect-release", (event, value) => {
    assertTrustedSender(event);
    const targetId = SpoilerTargetIdSchema.parse(value);
    return mutations.run(async () => {
      const rootSetId = await resolveOptionalCatalogRootSetId(targetId);
      const current = workspace.readSpoilerState();

      if (current.policy === "show") {
        throw new Error('Turn off "Always show previews" before protecting one release.');
      }

      const protectionTarget = releaseProtectionTarget(current, targetId, rootSetId);
      if (!protectionTarget) {
        throw new Error("This release is not present in the installed catalog.");
      }

      return spoilers.protectRelease(protectionTarget);
    });
  });
  ipcMain.handle("spoilers:protect-all", (event) => {
    assertTrustedSender(event);
    return mutations.run(() => {
      const state = spoilers.protectAll();
      publishRendererEvent("preferences:changed", workspace.readPreferences());
      return state;
    });
  });

  return {
    close: unsubscribe,
    publish: () => publishRendererEvent("spoilers:changed", spoilers.snapshot()),
  };
}

async function requireCatalogRootSetId(targetId: string) {
  const rootSetId = await resolveCatalogRootSetId(targetId);

  if (!rootSetId) {
    throw new Error("This release is not present in the installed catalog.");
  }

  return rootSetId;
}

async function resolveOptionalCatalogRootSetId(targetId: string) {
  try {
    return await resolveCatalogRootSetId(targetId);
  } catch {
    return null;
  }
}
