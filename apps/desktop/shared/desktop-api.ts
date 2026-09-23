import { CatalogSnapshotSchema, type Color } from "@mooligan/domain/catalog";
import type { DeckCost } from "@mooligan/domain/deck-cost";
import type { ExchangeRates, PriceStatus, PrintingPrices } from "@mooligan/domain/market";
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
  CollectionProjectionResult,
} from "@mooligan/domain/collection";
import type {
  CollectionProjectionDelta,
  CollectionProjectionSnapshot,
  DeckCostRequest,
} from "@mooligan/workspace/transport";
import type {
  CatalogPrintingResult,
  CatalogReleaseSummary,
  SpoilerProjectionDelta,
  SpoilerProjectionResult,
  SpoilerProjectionSnapshot,
  SpoilerRevealSummaries,
} from "@mooligan/domain/spoilers";
import type { WorkspaceBackup } from "@mooligan/workspace/backup";
import { Schema } from "effect";

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
} from "@mooligan/account/runtime";
import type { WorkspaceBootstrap, WorkspaceRuntime, AuthSnapshot } from "@mooligan/account/runtime";

export const CatalogProgressSchema = Schema.Struct({
  completedBytes: Schema.NonNegativeInt,
  completedCards: Schema.NonNegativeInt,
  totalBytes: Schema.NonNegativeInt,
});
export type CatalogProgress = typeof CatalogProgressSchema.Type;

export const CatalogStatusSchema = Schema.Union(
  Schema.Struct({ installed: Schema.Literal(false) }),
  Schema.Struct({
    ...CatalogSnapshotSchema.fields,
    installed: Schema.Literal(true),
    updateAvailable: Schema.Boolean,
  }),
);
export type CatalogStatus = typeof CatalogStatusSchema.Type;

export type DesktopApi = {
  prices: {
    exchangeRates: () => Promise<ExchangeRates | null>;
    status: () => Promise<PriceStatus>;
    refresh: () => Promise<PriceStatus>;
    printing: (printingId: string) => Promise<PrintingPrices>;
    onUpdated: (callback: () => void) => () => void;
  };
  auth: {
    onChanged: (callback: (snapshot: AuthSnapshot) => void) => () => void;
    onError: (callback: (message: string) => void) => () => void;
    read: () => Promise<AuthSnapshot>;
    refresh: () => Promise<AuthSnapshot>;
    signIn: () => Promise<AuthSnapshot>;
    signOut: () => Promise<AuthSnapshot>;
  };
  catalog: {
    deckCost: (request: DeckCostRequest) => Promise<DeckCost>;
    colors: (printingIds: string[]) => Promise<Color[] | null>;
    cancelQuery: (requestId: string) => Promise<void>;
    detail: (printingId: string) => Promise<CatalogPrintingResult | null>;
    download: () => Promise<CatalogStatus>;
    list: (request?: CatalogListRequest, requestId?: string) => Promise<CatalogListPage>;
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
    list: (request?: CollectionListRequest, requestId?: string) => Promise<CollectionListResult>;
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
