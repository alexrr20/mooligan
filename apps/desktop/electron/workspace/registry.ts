import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { WorkspaceRegistry as SharedWorkspaceRegistry } from "@mooligan/account/registry";

export type { RegisteredWorkspace } from "@mooligan/account/registry";

export class WorkspaceRegistry extends SharedWorkspaceRegistry {
  constructor(userDataRoot: string) {
    mkdirSync(userDataRoot, { recursive: true });
    super(
      new DatabaseSync(join(userDataRoot, "workspace-registry-v4.sqlite"), { timeout: 5_000 }),
      randomUUID,
    );
  }
}
