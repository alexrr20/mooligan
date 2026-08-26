import type { CatalogSnapshot } from "@mooligan/domain/catalog";
import type {
  CatalogListPage,
  CatalogListRequest,
  CatalogUpcomingPrintingPage,
  CatalogUpcomingPrintingRequest,
} from "@mooligan/domain/catalog-search";
import type {
  AddCollectionHoldingRequest,
  CollectionLot,
  CollectionListPage,
  CollectionListRequest,
  CollectionMutationResult,
  RemoveCollectionHoldingRequest,
  UpdateCollectionHoldingRequest,
} from "@mooligan/domain/collection";
import type { Deck } from "@mooligan/domain/decks";
import type { CardList } from "@mooligan/domain/lists";
import type {
  CatalogPrintingResult,
  CatalogReleaseSummary,
  SpoilerProjectionDelta,
  SpoilerProjectionResult,
  SpoilerProjectionSnapshot,
  SpoilerDecisionState,
  SpoilerPolicy,
  SpoilerRevealScope,
  SpoilerRevealSummaries,
} from "@mooligan/domain/spoilers";
import {
  SpoilerProjectionConnectionSchema,
  SpoilerProjectionDeltaSchema,
  SpoilerProjectionResultSchema,
  SpoilerProjectionSnapshotSchema,
} from "@mooligan/domain/spoilers";
import * as z from "zod";
import type { JSONType } from "zod";

export const WorkspaceBootstrapSchema = z.strictObject({
  clientId: z.uuidv4(),
  workspaceId: z.uuidv4(),
});
export type WorkspaceBootstrap = z.infer<typeof WorkspaceBootstrapSchema>;

export function validateWorkspaceBootstrap(value: JSONType): WorkspaceBootstrap {
  return WorkspaceBootstrapSchema.parse(value);
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

export type CatalogProgress = {
  completedBytes: number;
  completedCards: number;
  totalBytes: number;
};

export type CatalogStatus =
  | { installed: false }
  | (CatalogSnapshot & { installed: true; updateAvailable: boolean });

export type MotionPreference = "system" | "reduced" | "full";

type BackupEntity<Entity> = { id: string; value: Entity };

export type WorkspaceBackupSpoilerDecision = {
  scope: SpoilerRevealScope;
  state: SpoilerDecisionState;
  targetId: string;
};

export type WorkspaceBackup = {
  cardLists: BackupEntity<CardList>[];
  collectionLots: BackupEntity<CollectionLot>[];
  decks: BackupEntity<Deck>[];
  format: "mooligan-workspace";
  preferences: { motion: MotionPreference; spoilerPolicy: SpoilerPolicy };
  spoilerDecisions: WorkspaceBackupSpoilerDecision[];
  version: 2;
};

export type WorkspaceLegacyBackupSnapshot = Pick<
  WorkspaceBackup,
  "cardLists" | "collectionLots" | "decks"
> & { motion: MotionPreference };

export type Preferences = {
  motion: MotionPreference;
};

export type PreferencesUpdate = Partial<Preferences>;

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
  };
  collection: {
    add: (request: AddCollectionHoldingRequest) => Promise<CollectionMutationResult>;
    list: (request?: CollectionListRequest) => Promise<CollectionListPage>;
    onChanged: (callback: () => void) => () => void;
    remove: (request: RemoveCollectionHoldingRequest) => Promise<void>;
    update: (request: UpdateCollectionHoldingRequest) => Promise<CollectionMutationResult>;
  };
  preferences: {
    onChanged: (callback: (preferences: Preferences) => void) => () => void;
    read: () => Promise<Preferences>;
    update: (update: PreferencesUpdate) => Promise<Preferences>;
  };
  workspaceProjection: {
    applySpoilerDelta: (delta: SpoilerProjectionDelta) => Promise<SpoilerProjectionResult>;
    connectSpoilers: (workspaceId: string) => Promise<{ sessionId: string; workspaceId: string }>;
    onSpoilersChanged: (callback: () => void) => () => void;
    replaceSpoilers: (snapshot: SpoilerProjectionSnapshot) => Promise<SpoilerProjectionResult>;
  };
  workspace: {
    activateRestore: (workspaceId: string) => Promise<void>;
    beginRestore: (snapshot: WorkspaceLegacyBackupSnapshot) => Promise<WorkspaceBootstrap>;
    bootstrap: () => Promise<WorkspaceBootstrap>;
    cancelRestore: (workspaceId: string) => Promise<void>;
    exportBackup: (backup: WorkspaceBackup) => Promise<"cancelled" | "exported">;
    readLegacyBackupSnapshot: () => Promise<WorkspaceLegacyBackupSnapshot>;
    selectBackup: () => Promise<WorkspaceBackup | null>;
  };
};
