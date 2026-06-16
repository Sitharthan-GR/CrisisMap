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
}
