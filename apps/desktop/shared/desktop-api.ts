import type { CatalogSnapshot } from "@mooligan/domain/catalog";
import type {
  CatalogListPage,
  CatalogListRequest,
  CatalogUpcomingPrintingPage,
  CatalogUpcomingPrintingRequest,
} from "@mooligan/domain/catalog-search";
import type {
  CollectionListResult,
  CollectionListRequest,
  CollectionPrintingValidationRequest,
  CollectionProjectionDelta,
  CollectionProjectionResult,
  CollectionProjectionSnapshot,
} from "@mooligan/domain/collection";
import {
  CollectionListResultSchema,
  CollectionPrintingValidationRequestSchema,
  CollectionProjectionConnectionSchema,
  CollectionProjectionDeltaSchema,
  CollectionProjectionResultSchema,
  CollectionProjectionSnapshotSchema,
} from "@mooligan/domain/collection";
import type {
  CatalogPrintingResult,
  CatalogReleaseSummary,
  SpoilerProjectionDelta,
  SpoilerProjectionResult,
  SpoilerProjectionSnapshot,
  SpoilerRevealSummaries,
} from "@mooligan/domain/spoilers";
import {
  SpoilerProjectionConnectionSchema,
  SpoilerProjectionDeltaSchema,
  SpoilerProjectionResultSchema,
  SpoilerProjectionSnapshotSchema,
} from "@mooligan/domain/spoilers";
import type { WorkspaceBackup } from "@mooligan/workspace/backup";
import type { JSONType } from "zod";

export type { WorkspaceBackup } from "@mooligan/workspace/backup";

export {
  WorkspaceBootstrapSchema,
  WorkspaceSummarySchema,
  WorkspaceSyncSessionSchema,
  WorkspaceSyncIssueSchema,
  WorkspaceRuntimeSchema,
  validateWorkspaceBootstrap,
  validateWorkspaceRuntime,
} from "@mooligan/account/runtime";
export type {
  WorkspaceBootstrap,
  WorkspaceSummary,
  WorkspaceSyncSession,
  WorkspaceSyncIssue,
  WorkspaceRuntime,
  AuthStatus,
  AuthUser,
  AuthSnapshot,
} from "@mooligan/account/runtime";
import type { WorkspaceBootstrap, WorkspaceRuntime, AuthSnapshot } from "@mooligan/account/runtime";

export function validateCollectionListResult(value: JSONType) {
  return CollectionListResultSchema.parse(value);
}

export function validateCollectionPrintingRequest(value: JSONType) {
  return CollectionPrintingValidationRequestSchema.parse(value);
}

export function validateCollectionProjectionConnection(value: JSONType) {
  return CollectionProjectionConnectionSchema.parse(value);
}

export function validateCollectionProjectionDelta(value: JSONType) {
  return CollectionProjectionDeltaSchema.parse(value);
}

export function validateCollectionProjectionResult(value: JSONType) {
  return CollectionProjectionResultSchema.parse(value);
}

export function validateCollectionProjectionSnapshot(value: JSONType) {
  return CollectionProjectionSnapshotSchema.parse(value);
}

export function validateSpoilerProjectionConnection(value: JSONType) {
  return SpoilerProjectionConnectionSchema.parse(value);
}

export function validateSpoilerProjectionDelta(value: JSONType) {
  return SpoilerProjectionDeltaSchema.parse(value);
}

export function validateSpoilerProjectionResult(value: JSONType) {
  return SpoilerProjectionResultSchema.parse(value);
}

export function validateSpoilerProjectionSnapshot(value: JSONType) {
  return SpoilerProjectionSnapshotSchema.parse(value);
}

export type CatalogProgress = {
  completedBytes: number;
  completedCards: number;
  totalBytes: number;
};

export type CatalogStatus =
  | { installed: false }
  | (CatalogSnapshot & { installed: true; updateAvailable: boolean });

export type DesktopApi = {
  auth: {
    onChanged: (callback: (snapshot: AuthSnapshot) => void) => () => void;
    onError: (callback: (message: string) => void) => () => void;
    read: () => Promise<AuthSnapshot>;
    refresh: () => Promise<AuthSnapshot>;
    signIn: () => Promise<AuthSnapshot>;
    signOut: () => Promise<AuthSnapshot>;
  };
  catalog: {
    detail: (printingId: string) => Promise<CatalogPrintingResult | null>;
    download: () => Promise<CatalogStatus>;
    list: (request?: CatalogListRequest) => Promise<CatalogListPage>;
    onProgress: (callback: (progress: CatalogProgress) => void) => () => void;
    resolveRootSetId: (targetId: string) => Promise<string | null>;
    spoilerRevealSummaries: () => Promise<SpoilerRevealSummaries>;
    status: () => Promise<CatalogStatus>;
    upcoming: () => Promise<CatalogReleaseSummary[]>;
    upcomingPrintings: (
      request?: CatalogUpcomingPrintingRequest,
    ) => Promise<CatalogUpcomingPrintingPage>;
    validateCollectionPrinting: (request: CollectionPrintingValidationRequest) => Promise<void>;
  };
  collection: {
    list: (request?: CollectionListRequest) => Promise<CollectionListResult>;
  };
  workspaceProjection: {
    applyCollectionDelta: (delta: CollectionProjectionDelta) => Promise<CollectionProjectionResult>;
    applySpoilerDelta: (delta: SpoilerProjectionDelta) => Promise<SpoilerProjectionResult>;
    connectCollection: (workspaceId: string) => Promise<{ sessionId: string; workspaceId: string }>;
    connectSpoilers: (workspaceId: string) => Promise<{ sessionId: string; workspaceId: string }>;
    onCollectionResyncRequired: (callback: () => void) => () => void;
    onSpoilersChanged: (callback: () => void) => () => void;
    replaceCollection: (
      snapshot: CollectionProjectionSnapshot,
    ) => Promise<CollectionProjectionResult>;
    replaceSpoilers: (snapshot: SpoilerProjectionSnapshot) => Promise<SpoilerProjectionResult>;
  };
  workspace: {
    activateRestore: (workspaceId: string) => Promise<void>;
    beginRestore: () => Promise<WorkspaceBootstrap>;
    bootstrap: () => Promise<WorkspaceBootstrap>;
    cancelRestore: (workspaceId: string) => Promise<void>;
    exportBackup: (backup: WorkspaceBackup) => Promise<"cancelled" | "exported">;
    onChanged: (callback: () => void) => () => void;
    refreshSync: () => Promise<WorkspaceRuntime>;
    runtime: () => Promise<WorkspaceRuntime>;
    select: (workspaceId: string) => Promise<void>;
    selectBackup: () => Promise<WorkspaceBackup | null>;
  };
};
