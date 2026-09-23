import { UuidSchema, type JsonValue, StrictStruct, UuidV4Schema } from "@mooligan/domain/schema";
import { Schema } from "effect";

export const WorkspaceBootstrapSchema = StrictStruct({
  clientId: UuidV4Schema,
  workspaceId: UuidSchema,
});
export type WorkspaceBootstrap = typeof WorkspaceBootstrapSchema.Type;

export const WorkspaceSummarySchema = StrictStruct({
  accountAssociation: Schema.Literal("account", "unbound"),
  active: Schema.Boolean,
  label: Schema.Trim.pipe(Schema.minLength(1), Schema.maxLength(80)),
  workspaceId: UuidSchema,
});
export type WorkspaceSummary = typeof WorkspaceSummarySchema.Type;

/** A bearer credential: bounded and free of whitespace. */
export const SyncCredentialSchema = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(8_192),
  Schema.pattern(/^\S+$/u),
);

export const WorkspaceSyncSessionSchema = StrictStruct({
  accountWorkspaceId: UuidSchema,
  credential: SyncCredentialSchema,
  expiresAt: Schema.Int.pipe(Schema.positive()),
});
export type WorkspaceSyncSession = typeof WorkspaceSyncSessionSchema.Type;

export const WorkspaceSyncIssueSchema = Schema.Literal(
  "account-service-unavailable",
  "client-upgrade-required",
  "session-unavailable",
  "workspace-unavailable",
);
export type WorkspaceSyncIssue = typeof WorkspaceSyncIssueSchema.Type;

export const WorkspaceRuntimeSchema = StrictStruct({
  ...WorkspaceBootstrapSchema.fields,
  sync: Schema.NullOr(WorkspaceSyncSessionSchema),
  syncIssue: Schema.NullOr(WorkspaceSyncIssueSchema),
  workspaces: Schema.Array(WorkspaceSummarySchema).pipe(Schema.minItems(1)),
}).pipe(
  Schema.filter((runtime) => {
    const issues: Schema.FilterIssue[] = [];
    const active = runtime.workspaces.filter(({ active }) => active);
    if (active.length !== 1 || active[0]?.workspaceId !== runtime.workspaceId) {
      issues.push({
        message: "The active workspace does not match the runtime workspace.",
        path: ["workspaces"],
      });
    }
    if (runtime.sync && runtime.sync.accountWorkspaceId !== runtime.workspaceId) {
      issues.push({
        message: "The sync session does not match the runtime workspace.",
        path: ["sync", "accountWorkspaceId"],
      });
    }
    return issues;
  }),
);
export type WorkspaceRuntime = typeof WorkspaceRuntimeSchema.Type;

export const validateWorkspaceBootstrap: (value: JsonValue) => WorkspaceBootstrap =
  Schema.decodeUnknownSync(WorkspaceBootstrapSchema);

export const validateWorkspaceRuntime: (value: JsonValue) => WorkspaceRuntime =
  Schema.decodeUnknownSync(WorkspaceRuntimeSchema);

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
