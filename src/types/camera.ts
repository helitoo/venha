export type ViewMode = "grid" | "map";

export type FloodLevel = "LEVEL_0" | "LEVEL_1" | "LEVEL_2" | "LEVEL_3" | "UNCLEAR";

export type WeatherCategory = "droplet" | "cloud-rain" | "tornado" | "leaf";

export interface CameraItem {
  CamId: string;
  CamName: string;
  Disctrict?: string;
  District?: string; // normalize district field
  SnapshotUrl: string;
  ManagementUnit: boolean | string;
  Lat?: number;
  Lng?: number;
  Angle?: number;
  Code?: string;
  CamType?: string;
  VideoStreaming?: boolean;
}

export interface CameraStreamState {
  currentImgSrc: string;
  isInitialLoading: boolean;
  isFetching: boolean;
  hasError: boolean;
  timeLeft: number;
  isCountingDown: boolean;
}

export interface CameraWeatherState {
  weatherCode: number;
  precipitation?: number;
  rain?: number;
  showers?: number;
  category: WeatherCategory;
  updatedAt: number;
}

export interface CameraFloodAnalysis {
  camId: string;
  floodLevel: FloodLevel;
  description?: string;
  isRaining?: boolean;
  rainIntensity?: "none" | "light" | "moderate" | "heavy";
  roadCondition?: "dry" | "wet" | "flooded";
  trafficDensity?: "low" | "moderate" | "high" | "jam";
  trafficSpeed?: "fast" | "normal" | "slow" | "standstill";
  confidence?: number;
  analyzedAt: number;
}

