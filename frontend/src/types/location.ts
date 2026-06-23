import type { LocationMethod } from "./report";

export interface PickedMapLocation {
  lat: number;
  lng: number;
  label: string;
  buildingFootprintId?: string;
  source: "search" | "map" | "building" | "gps";
}

export interface ReportLocationPrefill {
  latitude: number;
  longitude: number;
  placeLabel: string;
  locationMethod: LocationMethod;
  crisisId?: string;
  buildingFootprintId?: string;
  /** When true, open the report form with “Other (not listed)” pre-selected. */
  preferUnlistedCrisis?: boolean;
}
