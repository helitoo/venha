import { CameraItem, CameraFloodAnalysis, FloodLevel } from "./camera";
import { FloodHotspot } from "@/data/floodHotspots";

export interface SavedLocation {
  id: "work" | "home" | "custom";
  name: string;
  lat: number;
  lng: number;
  address?: string;
}

export interface RouteStep {
  instruction: string;
  name: string;
  distance: number;
  duration: number;
}

export interface CameraOnRoute {
  camera: CameraItem;
  distanceFromStartMeters: number;
  floodInfo?: CameraFloodAnalysis;
  matchedHotspot?: FloodHotspot;
}

export interface RouteAnalysis {
  id: string;
  index: number;
  name: string;
  distanceMeters: number;
  durationSeconds: number;
  geometry: [number, number][]; // [lat, lng] coordinates for Leaflet polyline
  cameras: CameraOnRoute[];
  hotspots: FloodHotspot[];
  maxFloodLevel: FloodLevel;
  floodedCount: number;
  isRecommended: boolean;
  recommendationReason?: string;
}

export interface RoutePlanResult {
  origin: SavedLocation;
  destination: SavedLocation;
  routes: RouteAnalysis[];
  recommendedRouteIndex: number;
  mascotQuote: string;
}
