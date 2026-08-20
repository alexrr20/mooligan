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
  CatalogUpcomingPrinting as CatalogUpcomingPrintingType,
} from "../electron/catalog/query";
import type { DesktopApi } from "../electron/preload";
import type {
  PreferenceSyncSnapshot as PreferenceSyncSnapshotType,
  PreferenceSyncStatus as PreferenceSyncStatusType,
} from "../electron/workspace/preference-sync";
import type {
  MotionPreference as MotionPreferenceType,
  Preferences as PreferencesType,
} from "../electron/workspace/preferences";

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

  interface Window extends DesktopApi {}
}
