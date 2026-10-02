import { getAllCameras } from "@/lib/cameras";
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

// Map WMO code to category
export function getWmoCategory(code: number): WeatherCategory {
  if (code === 61 || code === 63 || code === 65) {
    return "droplet"; // <Droplet />
  }
  if (code === 80 || code === 81 || code === 82) {
    return "cloud-rain"; // <CloudRain />
  }
  if (code === 95 || code === 96 || code === 99) {
    return "tornado"; // <Tornado />
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
 * Uses Spatial Haversine Clustering to minimize Open-Meteo API requests by >95%.
 */
export async function computeAggregatedWeatherState(): Promise<{
  weatherMap: Record<string, CameraWeatherState>;
  floodMap: Record<string, CameraFloodAnalysis>;
  lastUpdated: number;
}> {
  const allCameras = getAllCameras();
  const sampleRadiusKm =
    parseFloat(process.env.NEXT_PUBLIC_WEATHER_SAMPLE_RADIUS_KM || "2.5") ||
    2.5;

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
          const category = getWmoCategory(weatherCode);

          repResults[cam.camId] = {
            weatherCode,
            precipitation: current.precipitation ?? 0,
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

  const floodTtlMinutes =
    parseInt(process.env.GEMINI_FLOOD_TTL_MINUTES || "10", 10) || 10;
  const floodTtlMs = floodTtlMinutes * 60 * 1000;

  clusters.forEach((cl) => {
    const repW = repResults[cl.representative.CamId];
    if (repW) {
      cl.members.forEach((m) => {
        fullWeatherMap[m.CamId] = { ...repW };

        // Check if an analyzed flood state already exists and is still within TTL
        const existingFlood = cache.floodMap[m.CamId];
        if (
          existingFlood &&
          now - (existingFlood.analyzedAt || 0) < floodTtlMs
        ) {
          fullFloodMap[m.CamId] = existingFlood;
          return;
        }

        // Determine default flood assessment based on weather severity
        if ([95, 96, 99].includes(repW.weatherCode)) {
          fullFloodMap[m.CamId] = {
            camId: m.CamId,
            floodLevel: "LEVEL_1",
            description: "Cảnh báo giông bão - Tuyến đường có nguy cơ ngập nhẹ",
            analyzedAt: now,
          };
        } else if ([80, 81, 82].includes(repW.weatherCode)) {
          fullFloodMap[m.CamId] = {
            camId: m.CamId,
            floodLevel: "LEVEL_0",
            description: "Mưa rào diện rộng - Tuyến đường tạm thời thông suốt",
            analyzedAt: now,
          };
        } else {
          fullFloodMap[m.CamId] = {
            camId: m.CamId,
            floodLevel: "LEVEL_0",
            description: "Thời tiết thông thoáng - Tuyến đường khô ráo, không ngập",
            analyzedAt: now,
          };
        }
      });
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
  const intervalSec = parseInt(process.env.NEXT_PUBLIC_FLOOD_INTERVAL || "60", 10) || 60;
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
