import { getAllCameras } from "@/lib/cameras";
import { fetchBatchCameraSnapshots } from "@/lib/server-camera";
import { analyzeFloodWithGemini, CameraImageInput } from "@/lib/server-flood-analysis";
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

  const camsNeedingFloodAnalysis: CameraItem[] = [];

  clusters.forEach((cl) => {
    const repW = repResults[cl.representative.CamId];
    if (repW) {
      const isRainy =
        [80, 81, 82, 95, 96, 99].includes(repW.weatherCode) ||
        (repW.precipitation !== undefined && repW.precipitation > 0.5);

      cl.members.forEach((m) => {
        fullWeatherMap[m.CamId] = { ...repW };

        // Layer 1: Weather Gating - Dry/clear weather is automatically Level 0 (0 token, 0 fetch)
        if (!isRainy) {
          fullFloodMap[m.CamId] = {
            camId: m.CamId,
            floodLevel: "LEVEL_0",
            description: "Thời tiết thông thoáng - Tuyến đường khô ráo, không ngập",
            analyzedAt: now,
          };
          return;
        }

        // Layer 2: State TTL Cooldown - Check if analyzed flood state in cache is still fresh (< TTL)
        const existingFlood = cache.floodMap[m.CamId];
        if (
          existingFlood &&
          now - (existingFlood.analyzedAt || 0) < floodTtlMs
        ) {
          fullFloodMap[m.CamId] = existingFlood;
          return;
        }

        // Rainy & TTL expired / not yet analyzed -> needs proactive server fetch & AI analysis
        camsNeedingFloodAnalysis.push(m);
      });
    }
  });

  // 4. Server-side Proactive Snapshot Fetching & AI Flood Analysis for Rainy Cameras
  if (camsNeedingFloodAnalysis.length > 0) {
    try {
      // Proactively fetch camera snapshots on the server
      const camIds = camsNeedingFloodAnalysis.map((c) => c.CamId);
      const snapshotResults = await fetchBatchCameraSnapshots(camIds, 8, 6000);

      const itemsForGemini: CameraImageInput[] = [];
      const offlineCamIds: string[] = [];

      snapshotResults.forEach((res) => {
        if (res.imageBase64 && res.imageBase64.length > 50) {
          itemsForGemini.push({
            camId: res.camId,
            imageBase64: res.imageBase64,
          });
        } else {
          offlineCamIds.push(res.camId);
        }
      });

      // Handle offline/unavailable cameras
      offlineCamIds.forEach((camId) => {
        const offlineResult: CameraFloodAnalysis = {
          camId,
          floodLevel: "LEVEL_0",
          description: "Mất kết nối camera - Đang thử kết nối lại",
          analyzedAt: now,
        };
        fullFloodMap[camId] = offlineResult;
        cache.floodMap[camId] = offlineResult;
      });

      // Run Gemini AI Multimodal Flood Forecasting on available snapshots
      if (itemsForGemini.length > 0) {
        const analyzed = await analyzeFloodWithGemini(itemsForGemini, fullWeatherMap);
        analyzed.forEach((res) => {
          fullFloodMap[res.camId] = res;
          cache.floodMap[res.camId] = res;
        });
      }
    } catch (err) {
      console.error("[ServerWeather] Proactive flood analysis error:", err);
      // Fallback heuristics for any remaining cams
      camsNeedingFloodAnalysis.forEach((cam) => {
        if (!fullFloodMap[cam.CamId]) {
          const w = fullWeatherMap[cam.CamId];
          const isStorm = w && [95, 96, 99].includes(w.weatherCode);
          const fallbackRes: CameraFloodAnalysis = {
            camId: cam.CamId,
            floodLevel: isStorm ? "LEVEL_1" : "LEVEL_0",
            description: isStorm
              ? "Cảnh báo giông bão - Tuyến đường có nguy cơ ngập nhẹ"
              : "Mưa rào diện rộng - Tuyến đường thông suốt",
            analyzedAt: now,
          };
          fullFloodMap[cam.CamId] = fallbackRes;
          cache.floodMap[cam.CamId] = fallbackRes;
        }
      });
    }
  }

  // Ensure all valid cameras have a floodMap entry
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
