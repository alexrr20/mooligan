import type { AuthSnapshot } from "../auth/service.ts";

export interface WorkspaceSelection {
  readonly workspaceId: string;
}

type WorkspaceMutation<Result> = () => Result | PromiseLike<Result>;

export function canUseCurrentWorkspace(snapshot: Pick<AuthSnapshot, "status" | "user">): boolean {
  return (
    snapshot.status === "signed-out" ||
    snapshot.status === "protected-storage-unavailable" ||
    (snapshot.status === "sync-paused" && snapshot.user === null)
  );
}

export class WorkspaceMutationQueue {
  readonly #workspace: WorkspaceSelection;
  #operations = Promise.resolve();

  constructor(workspace: WorkspaceSelection) {
    this.#workspace = workspace;
  }

  run<Result>(operation: WorkspaceMutation<Result>): Promise<Result> {
    return this.runFor(this.#workspace.workspaceId, operation);
  }

  runFor<Result>(workspaceId: string, operation: WorkspaceMutation<Result>): Promise<Result> {
    const execute = async () => {
      assertSelectedWorkspace(this.#workspace, workspaceId);
      const result = await operation();
      assertSelectedWorkspace(this.#workspace, workspaceId);
      return result;
    };
    const result = this.#operations.then(execute, execute);
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export async function runForSelectedWorkspace<Result>(
  workspace: WorkspaceSelection,
  operation: () => Promise<Result>,
) {
  const workspaceId = workspace.workspaceId;
  const result = await operation();

  assertSelectedWorkspace(workspace, workspaceId);
  return result;
}

export async function runForUnchangedRevision<Result>(
  readRevision: () => number,
  operation: () => Promise<Result>,
) {
  const revision = readRevision();
  const result = await operation();

  if (readRevision() !== revision) {
    throw new Error("Spoiler choices changed before this action completed.");
  }

  return result;
}

export function assertSelectedWorkspace(workspace: WorkspaceSelection, workspaceId: string) {
  if (workspace.workspaceId !== workspaceId) {
    throw new Error("The active workspace changed before this action completed.");
  }
}
