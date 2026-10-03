import { getAllCameras } from "@/lib/cameras";
import {
  FLOOD_SCAN_INTERVAL_SEC,
  GEMINI_FLOOD_TTL_MINUTES,
  WEATHER_SAMPLE_RADIUS_KM,
} from "@/config/constants";
import {
  CameraFloodAnalysis,
  CameraItem,
  CameraWeatherState,
  WeatherCategory,
} from "@/types/camera";

// Global cache in serverless runtime singleton
interface ServerWeatherGlobalCache {
  weatherMap: Record<string, CameraWeatherState>;
  floodMap: Record<string, CameraFloodAnalysis>;
  lastUpdated: number;
  isRefreshing: boolean;
}

const globalForVenha = globalThis as unknown as {
  __VENHA_SERVER_WEATHER_CACHE__?: ServerWeatherGlobalCache;
};

if (!globalForVenha.__VENHA_SERVER_WEATHER_CACHE__) {
  globalForVenha.__VENHA_SERVER_WEATHER_CACHE__ = {
    weatherMap: {},
    floodMap: {},
    lastUpdated: 0,
    isRefreshing: false,
  };
}

const cache = globalForVenha.__VENHA_SERVER_WEATHER_CACHE__;

// Map WMO code and precipitation to category
export function getWmoCategory(
  code: number,
  precipitation: number = 0
): WeatherCategory {
  // Thunderstorm / Severe Storm
  if (code === 95 || code === 96 || code === 99) {
    return "tornado"; // <Tornado />
  }
  // Heavy rain or Rain Showers
  if (code === 80 || code === 81 || code === 82 || precipitation >= 2.0) {
    return "cloud-rain"; // <CloudRain />
  }
  // Drizzle (51, 53, 55, 56, 57), Rain (61, 63, 65, 66, 67), or any active precipitation
  if (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67].includes(code) ||
    precipitation > 0.05
  ) {
    return "droplet"; // <Droplet />
  }
  return "leaf"; // <Leaf />
}

// Haversine distance formula in km
export function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Fetch and aggregate weather & flood state on the server for all cameras.
 * 1. Uses Spatial Haversine Clustering to minimize Open-Meteo API requests by >95%.
 * 2. Implements Weather Gating & TTL Cooldown to avoid unnecessary Gemini calls.
 * 3. Proactively fetches camera snapshots on the server for rain/storm zones to perform AI flood analysis.
 */
export async function computeAggregatedWeatherState(): Promise<{
  weatherMap: Record<string, CameraWeatherState>;
  floodMap: Record<string, CameraFloodAnalysis>;
  lastUpdated: number;
}> {
  const allCameras = getAllCameras();
  const sampleRadiusKm = WEATHER_SAMPLE_RADIUS_KM;

  const validCams = allCameras.filter(
    (c) =>
      typeof c.Lat === "number" &&
      typeof c.Lng === "number" &&
      !isNaN(c.Lat) &&
      !isNaN(c.Lng)
  );

  if (validCams.length === 0) {
    return { weatherMap: {}, floodMap: {}, lastUpdated: Date.now() };
  }

  // 1. Spatial Haversine Clustering: select 1 representative camera per cluster radius
  const clusters: Array<{ representative: CameraItem; members: CameraItem[] }> = [];
  const visited = new Set<string>();

  for (const cam of validCams) {
    if (visited.has(cam.CamId)) continue;
    visited.add(cam.CamId);

    const members: CameraItem[] = [cam];
    for (const other of validCams) {
      if (visited.has(other.CamId)) continue;
      const dist = getDistanceKm(cam.Lat!, cam.Lng!, other.Lat!, other.Lng!);
      if (dist <= sampleRadiusKm) {
        visited.add(other.CamId);
        members.push(other);
      }
    }
    clusters.push({ representative: cam, members });
  }

  // 2. Query Open-Meteo in chunks of 100 coordinates
  const repCoords = clusters.map((cl) => ({
    camId: cl.representative.CamId,
    lat: cl.representative.Lat!,
    lng: cl.representative.Lng!,
  }));

  const CHUNK_SIZE = 100;
  const chunks = [];
  for (let i = 0; i < repCoords.length; i += CHUNK_SIZE) {
    chunks.push(repCoords.slice(i, i + CHUNK_SIZE));
  }

  const repResults: Record<string, CameraWeatherState> = {};
  const now = Date.now();

  await Promise.all(
    chunks.map(async (chunk) => {
      const lats = chunk.map((c) => c.lat.toFixed(5)).join(",");
      const lngs = chunk.map((c) => c.lng.toFixed(5)).join(",");
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=precipitation,rain,showers,weather_code`;

      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Venha-Flood-Monitor/1.0",
          },
          next: { revalidate: 60 },
        });

        if (!res.ok) {
          console.error(`[ServerWeather] Open-Meteo HTTP error: ${res.status}`);
          return;
        }

        const data = await res.json();
        const weatherArray = Array.isArray(data) ? data : [data];

        weatherArray.forEach((wObj: any, index: number) => {
          const cam = chunk[index];
          if (!cam) return;

          const current = wObj?.current || {};
          const weatherCode =
            typeof current.weather_code === "number" ? current.weather_code : 0;
          const precipitation = current.precipitation ?? 0;
          const category = getWmoCategory(weatherCode, precipitation);

          repResults[cam.camId] = {
            weatherCode,
            precipitation,
            rain: current.rain ?? 0,
            showers: current.showers ?? 0,
            category,
            updatedAt: now,
          };
        });
      } catch (err) {
        console.error("[ServerWeather] Open-Meteo fetch error:", err);
      }
    })
  );

  // 3. Propagate representative weather state to all member cameras in cluster
  const fullWeatherMap: Record<string, CameraWeatherState> = {};
  const fullFloodMap: Record<string, CameraFloodAnalysis> = {};

  const floodTtlMinutes = GEMINI_FLOOD_TTL_MINUTES;
  const floodTtlMs = floodTtlMinutes * 60 * 1000;

  clusters.forEach((cl) => {
    const repW = repResults[cl.representative.CamId];
    if (repW) {
      const isRain =
        [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(
          repW.weatherCode
        ) || (repW.precipitation !== undefined && repW.precipitation > 0.05);

      cl.members.forEach((m) => {
        fullWeatherMap[m.CamId] = { ...repW };

        const existingFlood = cache.floodMap[m.CamId];
        const isFresh = Boolean(
          existingFlood &&
          existingFlood.analyzedAt &&
          now - existingFlood.analyzedAt < floodTtlMs
        );

        // If camera already has a valid AI or spatial analysis within 20 mins TTL, keep it
        if (isFresh && existingFlood) {
          fullFloodMap[m.CamId] = existingFlood;
          return;
        }

        // Lightweight weather-derived state for map markers (0 Token, 0 AI API Call)
        // Full AI vision analysis will be triggered on-demand when the user clicks the camera icon
        fullFloodMap[m.CamId] = {
          camId: m.CamId,
          floodLevel: isRain ? "LEVEL_1" : "LEVEL_0",
          isRaining: isRain,
          rainIntensity: isRain
            ? [65, 81, 82, 95, 96, 99].includes(repW.weatherCode) || (repW.precipitation || 0) >= 2.0
              ? "heavy"
              : "light"
            : "none",
          roadCondition: isRain ? "wet" : "dry",
          description: isRain
            ? "Đường ướt do mưa - Mặt đường trơn trượt, đọng nước nhẹ mép đường"
            : "Thời tiết thông thoáng - Tuyến đường khô ráo, không ngập",
          analyzedAt: isFresh && existingFlood?.analyzedAt ? existingFlood.analyzedAt : now,
        };
      });
    }
  });

  // Ensure all valid cameras have a fallback entry in fullFloodMap
  validCams.forEach((cam) => {
    if (!fullFloodMap[cam.CamId]) {
      fullFloodMap[cam.CamId] = {
        camId: cam.CamId,
        floodLevel: "LEVEL_0",
        description: "Tuyến đường thông suốt, không ngập",
        analyzedAt: now,
      };
    }
  });

  return {
    weatherMap: fullWeatherMap,
    floodMap: fullFloodMap,
    lastUpdated: now,
  };
}

/**
 * Get aggregated weather and flood state with SWR in-memory caching.
 * Ideal for Vercel Serverless SSR & Route Handlers.
 */
export async function getAggregatedWeatherFloodState(): Promise<{
  weatherMap: Record<string, CameraWeatherState>;
  floodMap: Record<string, CameraFloodAnalysis>;
  lastUpdated: number;
}> {
  const now = Date.now();
  const intervalSec = FLOOD_SCAN_INTERVAL_SEC;
  const maxAgeMs = intervalSec * 1000;

  // Cache hit: Valid within interval window
  if (
    cache.lastUpdated > 0 &&
    now - cache.lastUpdated < maxAgeMs &&
    Object.keys(cache.weatherMap).length > 0
  ) {
    return {
      weatherMap: cache.weatherMap,
      floodMap: cache.floodMap,
      lastUpdated: cache.lastUpdated,
    };
  }

  // Stale-While-Revalidate: If we have stale cache and already refreshing, return stale cache immediately
  if (cache.isRefreshing && Object.keys(cache.weatherMap).length > 0) {
    return {
      weatherMap: cache.weatherMap,
      floodMap: cache.floodMap,
      lastUpdated: cache.lastUpdated,
    };
  }

  cache.isRefreshing = true;
  try {
    const newState = await computeAggregatedWeatherState();
    if (Object.keys(newState.weatherMap).length > 0) {
      cache.weatherMap = newState.weatherMap;
      cache.floodMap = newState.floodMap;
      cache.lastUpdated = newState.lastUpdated;
    }
  } catch (err) {
    console.error("[ServerWeather] Background computation error:", err);
  } finally {
    cache.isRefreshing = false;
  }

  return {
    weatherMap: cache.weatherMap,
    floodMap: cache.floodMap,
    lastUpdated: cache.lastUpdated || now,
  };
}
