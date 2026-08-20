import type {
  AuthSnapshot as AuthSnapshotType,
  AuthStatus as AuthStatusType,
  AuthUser as AuthUserType,
} from "../electron/auth/service";
import type { CatalogCardDetail as CatalogCardDetailType } from "@mooligan/domain/catalog-detail";
import type {
  CatalogPrintingResult as CatalogPrintingResultType,
  CatalogReleaseSummary as CatalogReleaseSummaryType,
  SpoilerPolicy as SpoilerPolicyType,
  SpoilerRevealSummaries as SpoilerRevealSummariesType,
  SpoilerState as SpoilerStateType,
} from "@mooligan/domain/spoilers";
import type {
  CatalogProgress as CatalogProgressType,
  CatalogStatus as CatalogStatusType,
} from "../electron/catalog/ipc";
import type {
  CatalogCardSummary as CatalogCardSummaryType,
  CatalogListPage as CatalogListPageType,
  CatalogListRequest,
  CatalogUpcomingPrinting as CatalogUpcomingPrintingType,
  CatalogUpcomingPrintingPage as CatalogUpcomingPrintingPageType,
  CatalogUpcomingPrintingRequest,
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
  detail: (printingId: string) => Promise<CatalogPrintingResultType | null>;
  download: () => Promise<CatalogStatusType>;
  list: (request?: CatalogListRequest) => Promise<CatalogListPageType>;
  onProgress: (callback: (progress: CatalogProgressType) => void) => () => void;
  spoilerRevealSummaries: () => Promise<SpoilerRevealSummariesType>;
  status: () => Promise<CatalogStatusType>;
  upcoming: () => Promise<CatalogReleaseSummaryType[]>;
  upcomingPrintings: (
    request?: CatalogUpcomingPrintingRequest,
  ) => Promise<CatalogUpcomingPrintingPageType>;
};

type SpoilersApi = {
  onChanged: (callback: (state: SpoilerStateType) => void) => () => void;
  protectAll: () => Promise<SpoilerStateType>;
  protectPrinting: (printingId: string) => Promise<SpoilerStateType>;
  protectRelease: (setId: string) => Promise<SpoilerStateType>;
  read: () => Promise<SpoilerStateType>;
  revealPrinting: (printingId: string) => Promise<SpoilerStateType>;
  revealRelease: (setId: string) => Promise<SpoilerStateType>;
  setPolicy: (policy: SpoilerPolicyType) => Promise<SpoilerStateType>;
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
  type CatalogPrintingResult = CatalogPrintingResultType;
  type CatalogUpcomingPrinting = CatalogUpcomingPrintingType;
  type CatalogReleaseSummary = CatalogReleaseSummaryType;
  type AuthSnapshot = AuthSnapshotType;
  type AuthStatus = AuthStatusType;
  type AuthUser = AuthUserType;
  type MotionPreference = MotionPreferenceType;
  type PreferenceSyncSnapshot = PreferenceSyncSnapshotType;
  type PreferenceSyncStatus = PreferenceSyncStatusType;
  type Preferences = PreferencesType;
  type SpoilerPolicy = SpoilerPolicyType;
  type SpoilerRevealSummaries = SpoilerRevealSummariesType;
  type SpoilerState = SpoilerStateType;

  interface Window {
    auth: AuthApi;
    catalog: CatalogApi;
    preferenceSync: PreferenceSyncApi;
    preferences: PreferencesApi;
    spoilers: SpoilersApi;
    workspace: WorkspaceApi;
  }
}
