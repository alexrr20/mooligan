import type { CatalogSnapshot } from "@mooligan/domain/catalog";
import type {
  CatalogListPage,
  CatalogListRequest,
  CatalogUpcomingPrintingPage,
  CatalogUpcomingPrintingRequest,
} from "@mooligan/domain/catalog-search";
import type {
  AddCollectionHoldingRequest,
  CollectionListPage,
  CollectionListRequest,
  CollectionMutationResult,
  RemoveCollectionHoldingRequest,
  UpdateCollectionHoldingRequest,
} from "@mooligan/domain/collection";
import type {
  CatalogPrintingResult,
  CatalogReleaseSummary,
  SpoilerPolicy,
  SpoilerRevealSummaries,
  SpoilerState,
} from "@mooligan/domain/spoilers";

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

export type Preferences = {
  motion: MotionPreference;
  spoilerPolicy: SpoilerPolicy;
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
  spoilers: {
    onChanged: (callback: (state: SpoilerState) => void) => () => void;
    protectAll: () => Promise<SpoilerState>;
    protectPrinting: (printingId: string) => Promise<SpoilerState>;
    protectRelease: (setId: string) => Promise<SpoilerState>;
    read: () => Promise<SpoilerState>;
    revealPrinting: (printingId: string) => Promise<SpoilerState>;
    revealRelease: (setId: string) => Promise<SpoilerState>;
    setPolicy: (policy: SpoilerPolicy) => Promise<SpoilerState>;
  };
  workspace: {
    exportBackup: () => Promise<"cancelled" | "exported">;
    importBackup: () => Promise<"cancelled" | "imported">;
  };
};
