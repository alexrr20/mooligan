import type {
  CatalogCardSummary as CatalogCardSummaryType,
  CatalogUpcomingPrinting as CatalogUpcomingPrintingType,
} from "@mooligan/domain/catalog-search";
import type { CatalogCardDetail as CatalogCardDetailType } from "@mooligan/domain/catalog-detail";
import type {
  CollectionHolding as CollectionHoldingType,
  CollectionListPage as CollectionListPageType,
} from "@mooligan/domain/collection";
import type {
  CatalogPrintingResult as CatalogPrintingResultType,
  CatalogReleaseSummary as CatalogReleaseSummaryType,
  SpoilerRevealSummaries as SpoilerRevealSummariesType,
  SpoilerState as SpoilerStateType,
} from "@mooligan/domain/spoilers";
import type {
  AuthSnapshot as AuthSnapshotType,
  AuthStatus as AuthStatusType,
  AuthUser as AuthUserType,
  CatalogProgress as CatalogProgressType,
  CatalogStatus as CatalogStatusType,
  DesktopApi,
  MotionPreference as MotionPreferenceType,
  Preferences as PreferencesType,
} from "../shared/desktop-api";

declare global {
  type CatalogProgress = CatalogProgressType;
  type CatalogStatus = CatalogStatusType;
  type CatalogCardSummary = CatalogCardSummaryType;
  type CatalogCardDetail = CatalogCardDetailType;
  type CollectionHolding = CollectionHoldingType;
  type CollectionListPage = CollectionListPageType;
  type CatalogPrintingResult = CatalogPrintingResultType;
  type CatalogUpcomingPrinting = CatalogUpcomingPrintingType;
  type CatalogReleaseSummary = CatalogReleaseSummaryType;
  type AuthSnapshot = AuthSnapshotType;
  type AuthStatus = AuthStatusType;
  type AuthUser = AuthUserType;
  type MotionPreference = MotionPreferenceType;
  type Preferences = PreferencesType;
  type SpoilerRevealSummaries = SpoilerRevealSummariesType;
  type SpoilerState = SpoilerStateType;

  interface Window extends DesktopApi {}
}
