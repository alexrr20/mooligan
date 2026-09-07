import * as z from "zod";
import type { JSONType } from "zod";

export const WorkspaceBootstrapSchema = z.strictObject({
  clientId: z.uuidv4(),
  workspaceId: z.uuid(),
});
export type WorkspaceBootstrap = z.infer<typeof WorkspaceBootstrapSchema>;

export const WorkspaceSummarySchema = z.strictObject({
  accountAssociation: z.enum(["account", "unbound"]),
  active: z.boolean(),
  label: z.string().trim().min(1).max(80),
  workspaceId: z.uuid(),
});
export type WorkspaceSummary = z.infer<typeof WorkspaceSummarySchema>;

export const WorkspaceSyncSessionSchema = z.strictObject({
  accountWorkspaceId: z.uuid(),
  credential: z.string().min(1).max(8_192).regex(/^\S+$/u),
  expiresAt: z.number().int().positive(),
});
export type WorkspaceSyncSession = z.infer<typeof WorkspaceSyncSessionSchema>;

export const WorkspaceSyncIssueSchema = z.enum([
  "account-service-unavailable",
  "client-upgrade-required",
  "session-unavailable",
  "workspace-unavailable",
]);
export type WorkspaceSyncIssue = z.infer<typeof WorkspaceSyncIssueSchema>;

export const WorkspaceRuntimeSchema = WorkspaceBootstrapSchema.extend({
  sync: WorkspaceSyncSessionSchema.nullable(),
  syncIssue: WorkspaceSyncIssueSchema.nullable(),
  workspaces: z.array(WorkspaceSummarySchema).min(1),
}).superRefine((runtime, context) => {
  const active = runtime.workspaces.filter(({ active }) => active);
  if (active.length !== 1 || active[0]?.workspaceId !== runtime.workspaceId) {
    context.addIssue({
      code: "custom",
      message: "The active workspace does not match the runtime workspace.",
      path: ["workspaces"],
    });
  }
  if (runtime.sync && runtime.sync.accountWorkspaceId !== runtime.workspaceId) {
    context.addIssue({
      code: "custom",
      message: "The sync session does not match the runtime workspace.",
      path: ["sync", "accountWorkspaceId"],
    });
  }
});
export type WorkspaceRuntime = z.infer<typeof WorkspaceRuntimeSchema>;

export function validateWorkspaceBootstrap(value: JSONType): WorkspaceBootstrap {
  return WorkspaceBootstrapSchema.parse(value);
}

export function validateWorkspaceRuntime(value: JSONType): WorkspaceRuntime {
  return WorkspaceRuntimeSchema.parse(value);
}

export type AuthStatus =
  | "signed-out"
  | "signed-in"
  | "session-unavailable"
  | "protected-storage-unavailable";

export type AuthUser = {
  email: string;
  id: string;
  image: string | null;
  name: string;
};

export type AuthSnapshot = {
  pendingAuth: boolean;
  status: AuthStatus;
  user: AuthUser | null;
};
