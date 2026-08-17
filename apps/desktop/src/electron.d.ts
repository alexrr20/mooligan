import type {
  AuthSnapshot as AuthSnapshotType,
  AuthStatus as AuthStatusType,
  AuthUser as AuthUserType,
} from "../electron/auth/service";
import type { CatalogCardDetail as CatalogCardDetailType } from "@mooligan/domain/catalog-detail";
import type {
  CatalogProgress as CatalogProgressType,
  CatalogStatus as CatalogStatusType,
} from "../electron/catalog/ipc";
import type {
  CatalogCardSummary as CatalogCardSummaryType,
  CatalogListPage as CatalogListPageType,
  CatalogListRequest,
} from "../electron/catalog/query";
import type {
  PreferenceSyncSnapshot as PreferenceSyncSnapshotType,
  PreferenceSyncStatus as PreferenceSyncStatusType,
} from "../electron/workspace/preference-sync";
import type {
  MotionPreference as MotionPreferenceType,
  Preferences as PreferencesType,
  PreferencesUpdate,
} from "../electron/workspace/preferences";

type CatalogApi = {
  detail: (printingId: string) => Promise<CatalogCardDetailType | null>;
  download: () => Promise<CatalogStatusType>;
  list: (request?: CatalogListRequest) => Promise<CatalogListPageType>;
  onProgress: (callback: (progress: CatalogProgressType) => void) => () => void;
  status: () => Promise<CatalogStatusType>;
};

type PreferencesApi = {
  onChanged: (callback: (preferences: PreferencesType) => void) => () => void;
  read: () => Promise<PreferencesType>;
  update: (update: PreferencesUpdate) => Promise<PreferencesType>;
};

type PreferenceSyncApi = {
  onChanged: (callback: (snapshot: PreferenceSyncSnapshotType) => void) => () => void;
  read: () => Promise<PreferenceSyncSnapshotType>;
  retry: () => Promise<PreferenceSyncSnapshotType>;
};

type WorkspaceApi = {
  exportBackup: () => Promise<"cancelled" | "exported">;
  importBackup: () => Promise<"cancelled" | "imported">;
};

type AuthApi = {
  onChanged: (callback: (snapshot: AuthSnapshotType) => void) => () => void;
  onError: (callback: (message: string) => void) => () => void;
  read: () => Promise<AuthSnapshotType>;
  refresh: () => Promise<AuthSnapshotType>;
  signIn: () => Promise<AuthSnapshotType>;
  signOut: () => Promise<AuthSnapshotType>;
};

declare global {
  type CatalogProgress = CatalogProgressType;
  type CatalogStatus = CatalogStatusType;
  type CatalogCardSummary = CatalogCardSummaryType;
  type CatalogCardDetail = CatalogCardDetailType;
  type AuthSnapshot = AuthSnapshotType;
  type AuthStatus = AuthStatusType;
  type AuthUser = AuthUserType;
  type MotionPreference = MotionPreferenceType;
  type PreferenceSyncSnapshot = PreferenceSyncSnapshotType;
  type PreferenceSyncStatus = PreferenceSyncStatusType;
  type Preferences = PreferencesType;

  interface Window {
    auth: AuthApi;
    catalog: CatalogApi;
    preferenceSync: PreferenceSyncApi;
    preferences: PreferencesApi;
    workspace: WorkspaceApi;
  }
}
