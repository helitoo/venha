import { getAllCameras } from "@/lib/cameras";
import { fetchBatchCameraSnapshots } from "@/lib/server-camera";
import { analyzeFloodWithGemini, CameraImageInput } from "@/lib/server-flood-analysis";
import { isFrequentFloodCamera } from "@/data/floodHotspots";
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

  const floodTtlMinutes =
    parseInt(process.env.GEMINI_FLOOD_TTL_MINUTES || "10", 10) || 10;
  const floodTtlMs = floodTtlMinutes * 60 * 1000;

  const camsNeedingFloodAnalysis: CameraItem[] = [];

  clusters.forEach((cl) => {
    const repW = repResults[cl.representative.CamId];
    if (repW) {
      // WMO Codes for Heavy Rain / Showers / Thunderstorms that warrant AI flood inspection:
      // 65 (heavy rain), 80-82 (rain showers), 95-99 (thunderstorms)
      const HEAVY_RAIN_OR_STORM_CODES = [65, 80, 81, 82, 95, 96, 99];
      const isHeavyOrStorm =
        HEAVY_RAIN_OR_STORM_CODES.includes(repW.weatherCode) ||
        (repW.precipitation !== undefined && repW.precipitation >= 1.5);

      const isLightRainOrDrizzle =
        [51, 53, 55, 56, 57, 61, 63].includes(repW.weatherCode) ||
        (repW.precipitation !== undefined && repW.precipitation > 0 && repW.precipitation < 1.5);

      cl.members.forEach((m) => {
        fullWeatherMap[m.CamId] = { ...repW };

        const isHotspot = isFrequentFloodCamera(m);

        // TẦNG 1: Weather & Rain Gating
        // Khô ráo hoặc Mưa nhỏ/phùn (WMO 51-57, 61, 63) VÀ KHÔNG PHẢI điểm ngập thường xuyên
        // -> Tự động gán LEVEL_0 an toàn: ⚡ 0 Token - 0 API Call - 0 Fetch
        if (!isHeavyOrStorm && !isHotspot) {
          fullFloodMap[m.CamId] = {
            camId: m.CamId,
            floodLevel: "LEVEL_0",
            isRaining: isLightRainOrDrizzle,
            rainIntensity: isLightRainOrDrizzle ? "light" : "none",
            roadCondition: isLightRainOrDrizzle ? "wet" : "dry",
            description: isLightRainOrDrizzle
              ? "Mưa nhỏ / Mưa phùn nhẹ - Tuyến đường thông suốt, không ngập"
              : "Thời tiết thông thoáng - Tuyến đường khô ráo, không ngập",
            analyzedAt: now,
          };
          return;
        }

        // TẦNG 2: State TTL Cooldown (10 phút)
        // Kiểm tra xem camera đã được AI phân tích trong vòng TTL chưa
        const existingFlood = cache.floodMap[m.CamId];
        if (
          existingFlood &&
          now - (existingFlood.analyzedAt || 0) < floodTtlMs &&
          existingFlood.description &&
          !existingFlood.description.includes("Mất kết nối")
        ) {
          // Tái sử dụng State cũ từ Cache: ⚡ 0 Token - 0 API Call
          fullFloodMap[m.CamId] = existingFlood;
          return;
        }

        // Mưa to / Giông bão hoặc Điểm ngập thường xuyên & hết TTL -> Chuyển tiếp Tầng 3
        camsNeedingFloodAnalysis.push(m);
      });
    }
  });

  // TẦNG 3 & 4: Server Proactive Image Check & Micro-Batching (Tối đa 35 ảnh/batch)
  if (camsNeedingFloodAnalysis.length > 0) {
    try {
      // Ưu tiên sắp xếp:
      // 1. Giông bão (WMO 95-99)
      // 2. Điểm ngập thường xuyên / triều cường (Hotspots)
      // 3. Mưa rào lớn (WMO 80-82, precip >= 2.0)
      camsNeedingFloodAnalysis.sort((a, b) => {
        const wa = fullWeatherMap[a.CamId];
        const wb = fullWeatherMap[b.CamId];
        const stormA = wa && [95, 96, 99].includes(wa.weatherCode) ? 10 : 0;
        const stormB = wb && [95, 96, 99].includes(wb.weatherCode) ? 10 : 0;
        const spotA = isFrequentFloodCamera(a) ? 5 : 0;
        const spotB = isFrequentFloodCamera(b) ? 5 : 0;
        return stormB + spotB - (stormA + spotA);
      });

      // Tầng 4 quy định Micro-Batching tối đa 35 ảnh/request để tối ưu token & tránh nghẽn server camera
      const maxBatchCount = parseInt(process.env.GEMINI_BATCH_SIZE || "35", 10) || 35;
      const batchForProactive = camsNeedingFloodAnalysis.slice(0, maxBatchCount);
      const remainingCams = camsNeedingFloodAnalysis.slice(maxBatchCount);

      // Tầng 3: Server chủ động fetch ảnh snapshot camera
      const camIds = batchForProactive.map((c) => c.CamId);
      const snapshotResults = await fetchBatchCameraSnapshots(camIds, 6, 5000);

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

      // Camera thực sự không phản hồi trong chu kỳ này -> gán fallback an toàn
      offlineCamIds.forEach((camId) => {
        const w = fullWeatherMap[camId];
        const isStorm = w && [95, 96, 99].includes(w.weatherCode);
        const isRain = w && ([65, 80, 81, 82].includes(w.weatherCode) || (w.precipitation || 0) > 0);

        const offlineResult: CameraFloodAnalysis = {
          camId,
          floodLevel: isStorm ? "LEVEL_1" : "LEVEL_0",
          isRaining: Boolean(isStorm || isRain),
          rainIntensity: isStorm ? "heavy" : isRain ? "moderate" : "none",
          roadCondition: isStorm || isRain ? "wet" : "dry",
          description: isStorm
            ? "Khu vực có giông bão - Đang kết nối lại luồng hình ảnh camera"
            : isRain
            ? "Khu vực có mưa ẩm ướt - Đang kết nối lại luồng hình ảnh camera"
            : "Tuyến đường thông suốt - Đang kết nối lại luồng hình ảnh camera",
          analyzedAt: now,
        };
        fullFloodMap[camId] = offlineResult;
        cache.floodMap[camId] = offlineResult;
      });

      // TẦNG 4: Micro-Batching (Gom tối đa 35 ảnh/request) gửi sang Google Gemini AI
      if (itemsForGemini.length > 0) {
        const analyzed = await analyzeFloodWithGemini(itemsForGemini, fullWeatherMap);
        analyzed.forEach((res) => {
          fullFloodMap[res.camId] = res;
          cache.floodMap[res.camId] = res;
        });
      }

      // Xử lý các camera còn lại chưa kịp quét trong batch này (đợi chu kỳ sau quét tiếp)
      remainingCams.forEach((cam) => {
        const w = fullWeatherMap[cam.CamId];
        const isStorm = w && [95, 96, 99].includes(w.weatherCode);
        const isHeavy = w && ([65, 81, 82].includes(w.weatherCode) || (w.precipitation || 0) >= 2.0);
        const isSpot = isFrequentFloodCamera(cam);

        const pendingRes: CameraFloodAnalysis = {
          camId: cam.CamId,
          floodLevel: isStorm ? "LEVEL_1" : "LEVEL_0",
          isRaining: Boolean(isStorm || isHeavy),
          rainIntensity: isStorm ? "heavy" : isHeavy ? "moderate" : "light",
          roadCondition: "wet",
          description: isStorm
            ? "Cảnh báo giông bão diện rộng - Tuyến đường ẩm ướt, đang theo dõi ngập"
            : isHeavy
            ? "Mưa lớn diện rộng - Tuyến đường ẩm ướt, đang theo dõi ngập"
            : isSpot
            ? "Điểm trũng / triều cường - Tuyến đường thông suốt, chưa ghi nhận ngập"
            : "Có mưa ẩm ướt - Tuyến đường thông suốt, không ngập úng",
          analyzedAt: now,
        };
        fullFloodMap[cam.CamId] = pendingRes;
        cache.floodMap[cam.CamId] = pendingRes;
      });
    } catch (err) {
      console.error("[ServerWeather] Proactive flood analysis error:", err);
      camsNeedingFloodAnalysis.forEach((cam) => {
        if (!fullFloodMap[cam.CamId]) {
          const w = fullWeatherMap[cam.CamId];
          const isStorm = w && [95, 96, 99].includes(w.weatherCode);
          const isHeavyRain =
            w &&
            ([81, 82, 65].includes(w.weatherCode) ||
              (w.precipitation !== undefined && w.precipitation >= 4.0));
          const isHotspot = isFrequentFloodCamera(cam);

          const fallbackRes: CameraFloodAnalysis = {
            camId: cam.CamId,
            floodLevel: isStorm ? "LEVEL_1" : "LEVEL_0",
            isRaining: Boolean(isStorm || isHeavyRain),
            rainIntensity: isStorm ? "heavy" : isHeavyRain ? "moderate" : "none",
            roadCondition: isStorm || isHeavyRain ? "wet" : "dry",
            description: isStorm
              ? "Cảnh báo giông bão - Tuyến đường có nguy cơ ngập nhẹ"
              : isHeavyRain
              ? "Mưa lớn diện rộng - Tuyến đường ẩm ướt, đang theo dõi ngập"
              : isHotspot
              ? "Điểm trũng / triều cường - Tuyến đường thông suốt, chưa ghi nhận ngập"
              : "Có mưa ẩm ướt - Tuyến đường thông suốt, không ngập úng",
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
