import { CameraFloodAnalysis, CameraWeatherState, FloodLevel } from "@/types/camera";
import { getCameraTrafficDensity } from "@/lib/google-traffic";
import { optimizeCameraImageForAI, computeImageHash } from "@/lib/image-optimizer";
import { getFloodFromSupabase, upsertFloodToSupabase, upsertBatchFloodToSupabase, SupabaseFloodRecord } from "@/lib/supabase";
import { isFrequentFloodCamera } from "@/data/floodHotspots";
import {
  GEMINI_FLOOD_TTL_MINUTES,
  GEMINI_SPATIAL_CACHE_RADIUS_KM,
} from "@/config/constants";

export interface CameraImageInput {
  camId: string;
  imageBase64: string;
  imageHash?: string;
}

const DEFAULT_PROMPT = `Bạn là chuyên gia thị giác AI phân tích camera giao thông và cảnh báo ngập lụt, mưa, tình trạng mặt đường và mật độ xe cộ thời gian thực.
QUY TẮC BẮT BUỘC:
1. MỌI VĂN BẢN TIẾNG VIỆT TRẢ VỀ (trường 'description') PHẢI LÀ TIẾNG VIỆT CHUẨN CÓ ĐẦY ĐỦ DẤU THANH (như "Đường ướt do mưa, xe cộ lưu thông bình thường", "Mặt đường khô ráo, thông thoáng"), TUYỆT ĐỐI KHÔNG DÙNG TIẾNG VIỆT KHÔNG DẤU ("Duong uot...", "xe co...").
2. NHẬN DIỆN TRỜI MƯA & MẶT ĐƯỜNG ƯỚT (RẤT QUAN TRỌNG):
   - Hãy quan sát kỹ bề mặt nhựa đường: nếu mặt đường sáng bóng loáng phản chiếu vệt đèn pha xe cộ/đèn đường, có vệt nước lấp lánh, có hạt mưa trên ống kính, người đi xe máy mặc áo mưa/áo trùm, hoặc ô tô bật cần gạt nước -> BẮT BUỘC ĐÁNH GIÁ:
     * isRaining: true
     * roadCondition: "wet" (hoặc "flooded" nếu có nước dâng)
     * floodLevel: TỐI THIỂU là "LEVEL_1" (ngập nhẹ / đọng nước mép đường), hoặc "LEVEL_2" / "LEVEL_3" nếu ngập sâu. KHÔNG ĐƯỢC để LEVEL_0 khi trời đang mưa hoặc mặt đường ướt sũng!
   - Nếu mặt đường nhám mờ xám bình thường, không bóng nước, không có áo mưa, tầm nhìn quang đãng -> isRaining: false, roadCondition: "dry", floodLevel: "LEVEL_0".

3. CÁC TRƯỜNG THUỘC TÍNH CỦA MỖI CAMERA:
   - isRaining: boolean (true nếu đang mưa hoặc mặt đường đọng ướt do mưa, false nếu khô ráo).
   - rainIntensity: "none" | "light" | "moderate" | "heavy".
   - floodLevel:
     * "LEVEL_0": Khô ráo, không có mưa và không ngập.
     * "LEVEL_1": Trời có mưa / mặt đường ẩm ướt đọng nước nhẹ mép đường (<15cm).
     * "LEVEL_2": Ngập vừa (15cm-40cm) ngập nửa bánh xe máy.
     * "LEVEL_3": Ngập sâu nghiêm trọng (>40cm) ngập yên xe / lút bánh xe.
     * "UNCLEAR": Camera mất tín hiệu hoặc tối đen không nhìn rõ.
   - roadCondition: "dry" | "wet" | "flooded". (Nếu isRaining=true thì KHÔNG ĐƯỢC là "dry").
   - trafficDensity: "low" (vắng) | "moderate" (bình thường) | "high" (đông xe, nối đuôi nhau) | "jam" (kẹt xe nghiêm trọng).
   - trafficSpeed: "fast" | "normal" | "slow" | "standstill".
   - description: Một câu tiếng Việt chuẩn CÓ DẤU đầy đủ, lịch sự mô tả tình trạng (Ví dụ: "Đường ướt do mưa, phương tiện di chuyển chậm và cẩn thận", "Mặt đường khô ráo, giao thông thông suốt").

Trả về một JSON Array các object theo schema.`;

// Helper: Estimate realistic traffic density based on time-of-day rush hour and weather
export function estimateTrafficDensity(
  camId: string,
  isRain: boolean,
  isStorm: boolean
): {
  trafficDensity: "low" | "moderate" | "high" | "jam";
  trafficSpeed: "fast" | "normal" | "slow" | "standstill";
} {
  const result = getCameraTrafficDensity(
    { CamId: camId },
    {
      camId,
      floodLevel: isStorm || isRain ? "LEVEL_1" : "LEVEL_0",
      isRaining: isRain || isStorm,
      rainIntensity: isStorm ? "heavy" : isRain ? "moderate" : "none",
      roadCondition: isRain || isStorm ? "wet" : "dry",
      trafficDensity: "moderate",
      trafficSpeed: "normal",
      description: "",
      analyzedAt: Date.now(),
    }
  );
  return {
    trafficDensity: result.level,
    trafficSpeed: result.speed,
  };
}

/**
 * Perform server-side flood and rain analysis on camera images using Google Gemini AI.
 * Implements Micro-batching (up to GEMINI_BATCH_SIZE images/call) and multi-model fallback.
 */
export async function analyzeFloodWithGemini(
  items: CameraImageInput[],
  weatherMap?: Record<string, CameraWeatherState>
): Promise<CameraFloodAnalysis[]> {
  const now = Date.now();
  if (!items || items.length === 0) {
    return [];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
  const configuredFallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash";
  const promptText = process.env.GEMINI_FLOOD_PROMPT || DEFAULT_PROMPT;
  const mediaResolution = process.env.GEMINI_MEDIA_RESOLUTION || "MEDIA_RESOLUTION_LOW";
  const batchSize = parseInt(process.env.GEMINI_BATCH_SIZE || "35", 10) || 35;

  // Fallback heuristics when Gemini API is not configured or unavailable
  function getHeuristicFlood(camId: string, hasValidImage: boolean): CameraFloodAnalysis {
    const weather = weatherMap ? weatherMap[camId] : undefined;
    const wCode = weather?.weatherCode ?? 0;
    const precip = weather?.precipitation ?? 0;

    const isStorm = [95, 96, 99].includes(wCode);
    const isRain = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(wCode) || precip > 0;
    const traffic = estimateTrafficDensity(camId, isRain, isStorm);

    if (!hasValidImage) {
      return {
        camId,
        floodLevel: isStorm || isRain ? "LEVEL_1" : "LEVEL_0",
        isRaining: isStorm || isRain,
        rainIntensity: isStorm ? "heavy" : isRain ? "moderate" : "none",
        roadCondition: isStorm || isRain ? "wet" : "dry",
        trafficDensity: traffic.trafficDensity,
        trafficSpeed: traffic.trafficSpeed,
        description: isStorm
          ? "Khu vực có giông bão - Đang kết nối lại luồng hình ảnh"
          : isRain
          ? "Khu vực đang có mưa - Đang kết nối lại luồng hình ảnh"
          : "Tuyến đường thông suốt - Đang kết nối lại luồng hình ảnh",
        analyzedAt: now,
      };
    }

    if (isStorm) {
      return {
        camId,
        floodLevel: "LEVEL_1",
        isRaining: true,
        rainIntensity: "heavy",
        roadCondition: "wet",
        trafficDensity: traffic.trafficDensity,
        trafficSpeed: traffic.trafficSpeed,
        description: "Cảnh báo giông bão - Mặt đường ẩm ướt, đọng nước nhẹ mép đường",
        analyzedAt: now,
      };
    }

    if (isRain) {
      return {
        camId,
        floodLevel: "LEVEL_1", // Default flood level is Level 1 when raining per requirement
        isRaining: true,
        rainIntensity: [81, 82, 65].includes(wCode) || precip >= 2 ? "heavy" : "light",
        roadCondition: "wet",
        trafficDensity: traffic.trafficDensity,
        trafficSpeed: traffic.trafficSpeed,
        description: "Đường ướt do mưa, phương tiện di chuyển cẩn thận và an toàn",
        analyzedAt: now,
      };
    }

    return {
      camId,
      floodLevel: "LEVEL_0",
      isRaining: false,
      rainIntensity: "none",
      roadCondition: "dry",
      trafficDensity: traffic.trafficDensity,
      trafficSpeed: traffic.trafficSpeed,
      description: "Mặt đường khô ráo, tầm nhìn tốt, giao thông thông suốt",
      analyzedAt: now,
    };
  }

  // If no API key is set, return heuristic results
  if (!apiKey) {
    return items.map((item) =>
      getHeuristicFlood(item.camId, Boolean(item.imageBase64 && item.imageBase64.length > 50))
    );
  }

  const candidateModels = [
    configuredModel,
    configuredFallback,
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  // Split into micro-batches of batchSize
  const batches: CameraImageInput[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const allResults: CameraFloodAnalysis[] = [];

  for (const batch of batches) {
    // Filter items with valid images
    const validBatchItems = batch.filter(
      (item) => item.imageBase64 && item.imageBase64.length > 50
    );

    // If no valid images in this batch, apply heuristics
    if (validBatchItems.length === 0) {
      batch.forEach((item) => {
        allResults.push(getHeuristicFlood(item.camId, false));
      });
      continue;
    }

    // Optimize and compress images to 512px JPEG before sending to Gemini AI (90% size reduction)
    const optimizedBatchItems = await Promise.all(
      validBatchItems.map(async (item) => ({
        camId: item.camId,
        imageBase64: await optimizeCameraImageForAI(item.imageBase64, 512, 70),
      }))
    );

    // Build multimodal prompt parts for this batch
    const parts: any[] = [{ text: promptText }];
    for (const item of optimizedBatchItems) {
      const cleanBase64 = item.imageBase64.replace(/^data:image\/[a-zA-Z0-9+]+;base64,/, "");
      parts.push({
        text: `Camera ID: ${item.camId}`,
      });
      parts.push({
        inline_data: {
          mime_type: "image/jpeg",
          data: cleanBase64,
        },
      });
    }

    const geminiPayload = {
      contents: [
        {
          role: "user",
          parts: parts,
        },
      ],
      generationConfig: {
        response_mime_type: "application/json",
        response_schema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              camId: { type: "STRING" },
              isRaining: { type: "BOOLEAN" },
              rainIntensity: {
                type: "STRING",
                enum: ["none", "light", "moderate", "heavy"],
              },
              floodLevel: {
                type: "STRING",
                enum: ["LEVEL_0", "LEVEL_1", "LEVEL_2", "LEVEL_3", "UNCLEAR"],
              },
              roadCondition: {
                type: "STRING",
                enum: ["dry", "wet", "flooded"],
              },
              trafficDensity: {
                type: "STRING",
                enum: ["low", "moderate", "high", "jam"],
              },
              trafficSpeed: {
                type: "STRING",
                enum: ["fast", "normal", "slow", "standstill"],
              },
              description: { type: "STRING" },
            },
            required: ["camId", "floodLevel"],
          },
        },
        media_resolution: mediaResolution,
      },
    };

    let responseData: any = null;

    // Try candidate models with fallback
    for (const model of candidateModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload),
        });

        if (response.ok) {
          responseData = await response.json();
          break;
        }

        const errJson = await response.json().catch(() => ({}));
        console.warn(`[GeminiFlood] Model ${model} returned ${response.status}:`, errJson?.error?.message);

        if (response.status === 503 || response.status === 429) {
          await new Promise((res) => setTimeout(res, 600));
        }
      } catch (err) {
        console.warn(`[GeminiFlood] Failed to call model ${model}:`, err);
      }
    }

    const batchEvaluatedMap = new Map<string, CameraFloodAnalysis>();

    if (responseData) {
      const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed)) {
            parsed.forEach((resItem: any) => {
              if (resItem.camId) {
                const isRaining = Boolean(resItem.isRaining);
                let floodLevel: FloodLevel = [
                  "LEVEL_0",
                  "LEVEL_1",
                  "LEVEL_2",
                  "LEVEL_3",
                  "UNCLEAR",
                ].includes(resItem.floodLevel)
                  ? resItem.floodLevel
                  : "UNCLEAR";

                // Per requirement: when raining, default flood level is at least LEVEL_1
                if (isRaining && (floodLevel === "LEVEL_0" || floodLevel === "UNCLEAR")) {
                  floodLevel = "LEVEL_1";
                }

                let roadCondition = ["dry", "wet", "flooded"].includes(resItem.roadCondition)
                  ? resItem.roadCondition
                  : floodLevel !== "LEVEL_0"
                  ? "flooded"
                  : isRaining
                  ? "wet"
                  : "dry";

                if (isRaining && roadCondition === "dry") {
                  roadCondition = "wet";
                }

                const fallbackTraffic = estimateTrafficDensity(resItem.camId, isRaining, false);
                const trafficDensity = ["low", "moderate", "high", "jam"].includes(resItem.trafficDensity)
                  ? resItem.trafficDensity
                  : fallbackTraffic.trafficDensity;

                const trafficSpeed = ["fast", "normal", "slow", "standstill"].includes(resItem.trafficSpeed)
                  ? resItem.trafficSpeed
                  : fallbackTraffic.trafficSpeed;

                let description = resItem.description?.trim();
                if (!description || description.length < 5) {
                  description = isRaining
                    ? "Đường ướt do mưa, phương tiện di chuyển cẩn thận và an toàn."
                    : "Mặt đường khô ráo, phương tiện di chuyển thông thoáng và ổn định.";
                }

                batchEvaluatedMap.set(resItem.camId, {
                  camId: resItem.camId,
                  floodLevel,
                  isRaining,
                  rainIntensity: resItem.rainIntensity || (isRaining ? "moderate" : "none"),
                  roadCondition,
                  trafficDensity,
                  trafficSpeed,
                  description,
                  analyzedAt: now,
                });
              }
            });
          }
        } catch (parseErr) {
          console.error("[GeminiFlood] Error parsing Gemini JSON:", parseErr, rawText);
        }
      }
    }

    // Assign results or fallback for all items in batch
    batch.forEach((item) => {
      const analyzed = batchEvaluatedMap.get(item.camId);
      if (analyzed) {
        allResults.push(analyzed);
      } else {
        allResults.push(
          getHeuristicFlood(
            item.camId,
            Boolean(item.imageBase64 && item.imageBase64.length > 50)
          )
        );
      }
    });
  }

  // Async sync all analyzed results to Supabase
  if (allResults.length > 0) {
    const records: SupabaseFloodRecord[] = allResults.map((r) => ({
      cam_id: r.camId,
      flood_level: r.floodLevel,
      is_raining: Boolean(r.isRaining),
      rain_intensity: r.rainIntensity || "none",
      road_condition: r.roadCondition || "dry",
      traffic_density: r.trafficDensity || "moderate",
      traffic_speed: r.trafficSpeed || "normal",
      description: r.description || "",
      analyzed_at: r.analyzedAt || Date.now(),
    }));
    upsertBatchFloodToSupabase(records).catch(() => {});
  }

  return allResults;
}

// In-memory Spatial Cache Singleton
interface SpatialFloodCacheEntry {
  analysis: CameraFloodAnalysis;
  imageHash?: string;
  lat?: number;
  lng?: number;
  timestamp: number;
}

const globalCacheForSpatial = globalThis as unknown as {
  __VENHA_SPATIAL_FLOOD_CACHE__?: Map<string, SpatialFloodCacheEntry>;
};

if (!globalCacheForSpatial.__VENHA_SPATIAL_FLOOD_CACHE__) {
  globalCacheForSpatial.__VENHA_SPATIAL_FLOOD_CACHE__ = new Map();
}

const spatialCache = globalCacheForSpatial.__VENHA_SPATIAL_FLOOD_CACHE__;

// Helper: Haversine distance in km
function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
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
 * Save analysis to spatial cache and propagate to neighbor cameras within radius + Supabase DB
 */
export async function saveToSpatialCacheAndPropagate(
  camId: string,
  analysis: CameraFloodAnalysis,
  imageHash?: string
) {
  const now = Date.now();
  const radiusKm = GEMINI_SPATIAL_CACHE_RADIUS_KM;

  const { getAllCameras } = await import("@/lib/cameras");
  const allCameras = getAllCameras();
  const targetCam = allCameras.find((c) => c.CamId === camId);

  // 1. Save in-memory for target camera
  spatialCache.set(camId, {
    analysis: { ...analysis, analyzedAt: now },
    imageHash,
    lat: targetCam?.Lat,
    lng: targetCam?.Lng,
    timestamp: now,
  });

  // 2. Persist to Supabase DB (UPSERT)
  upsertFloodToSupabase({
    cam_id: camId,
    flood_level: analysis.floodLevel,
    is_raining: Boolean(analysis.isRaining),
    rain_intensity: analysis.rainIntensity || "none",
    road_condition: analysis.roadCondition || "dry",
    traffic_density: analysis.trafficDensity || "moderate",
    traffic_speed: analysis.trafficSpeed || "normal",
    description: analysis.description || "",
    image_hash: imageHash,
    lat: targetCam?.Lat,
    lng: targetCam?.Lng,
    analyzed_at: now,
  }).catch((err) => console.warn("[Supabase] Async upsert error:", err));

  if (!targetCam || typeof targetCam.Lat !== "number" || typeof targetCam.Lng !== "number") {
    return;
  }

  // 3. Propagate to neighbors within radius
  for (const neighbor of allCameras) {
    if (neighbor.CamId === camId) continue;
    if (typeof neighbor.Lat === "number" && typeof neighbor.Lng === "number") {
      const dist = calculateDistanceKm(targetCam.Lat, targetCam.Lng, neighbor.Lat, neighbor.Lng);
      if (dist <= radiusKm) {
        const neighborAnalysis: CameraFloodAnalysis = {
          ...analysis,
          camId: neighbor.CamId,
          analyzedAt: now,
        };

        spatialCache.set(neighbor.CamId, {
          analysis: neighborAnalysis,
          imageHash,
          lat: neighbor.Lat,
          lng: neighbor.Lng,
          timestamp: now,
        });

        // Async sync neighbor to Supabase
        upsertFloodToSupabase({
          cam_id: neighbor.CamId,
          flood_level: neighborAnalysis.floodLevel,
          is_raining: Boolean(neighborAnalysis.isRaining),
          rain_intensity: neighborAnalysis.rainIntensity || "none",
          road_condition: neighborAnalysis.roadCondition || "dry",
          traffic_density: neighborAnalysis.trafficDensity || "moderate",
          traffic_speed: neighborAnalysis.trafficSpeed || "normal",
          description: neighborAnalysis.description || "",
          image_hash: imageHash,
          lat: neighbor.Lat,
          lng: neighbor.Lng,
          analyzed_at: now,
        }).catch(() => {});
      }
    }
  }
}

/**
 * Check if camera or any neighbor has fresh analysis in Spatial Cache or Supabase (TTL 20 mins)
 */
export async function getFromSpatialCache(camId: string): Promise<CameraFloodAnalysis | null> {
  const now = Date.now();
  const ttlMinutes = GEMINI_FLOOD_TTL_MINUTES;
  const ttlMs = ttlMinutes * 60 * 1000;
  const radiusKm = GEMINI_SPATIAL_CACHE_RADIUS_KM;

  // 1. Direct Memory Cache hit for this camera
  const direct = spatialCache.get(camId);
  if (direct && now - direct.timestamp < ttlMs) {
    return direct.analysis;
  }

  // 2. Spatial Neighbor Memory Cache hit (within radiusKm)
  const { getAllCameras } = await import("@/lib/cameras");
  const allCameras = getAllCameras();
  const targetCam = allCameras.find((c) => c.CamId === camId);

  if (targetCam && typeof targetCam.Lat === "number" && typeof targetCam.Lng === "number") {
    for (const [otherId, entry] of spatialCache.entries()) {
      if (otherId === camId) continue;
      if (now - entry.timestamp < ttlMs && typeof entry.lat === "number" && typeof entry.lng === "number") {
        const dist = calculateDistanceKm(targetCam.Lat, targetCam.Lng, entry.lat, entry.lng);
        if (dist <= radiusKm) {
          return {
            ...entry.analysis,
            camId: targetCam.CamId,
          };
        }
      }
    }
  }

  // 3. Supabase Persistent Database Cache hit
  const supabaseEntry = await getFloodFromSupabase(camId, ttlMinutes);
  if (supabaseEntry) {
    spatialCache.set(camId, {
      analysis: supabaseEntry,
      lat: targetCam?.Lat,
      lng: targetCam?.Lng,
      timestamp: supabaseEntry.analyzedAt || now,
    });
    return supabaseEntry;
  }

  return null;
}

/**
 * Analyze a single camera on-demand (e.g. when user opens the Camera Detail Modal).
 * Multi-layer pipeline:
 * 1. Weather Gating (1 Hour TTL - 0 Token)
 * 2. Spatial Cache & Supabase Check (TTL 5-10m - 0 Token)
 * 3. Image Diff Hashing (Skip standing camera - 0 Token)
 * 4. Image Resizing 512px + 70% Quality Compression
 * 5. Gemini 2.5 Flash-Lite Analysis
 * 6. Spatial Propagation to Neighbor Cameras + Supabase Persistence
 */
export async function analyzeSingleCameraWithGemini(
  camId: string,
  providedBase64?: string,
  weather?: CameraWeatherState
): Promise<CameraFloodAnalysis> {
  const now = Date.now();

  // TẦNG 1: SPATIAL CACHE & SUPABASE CHECK (20 Phút TTL - ⚡ 0 Token)
  // Nếu camera hoặc khu vực lân cận trong 0.8km đã có kết quả trong vòng 20 phút -> Tái sử dụng nguyên vẹn timestamp cũ!
  const cached = await getFromSpatialCache(camId);
  if (cached && cached.analyzedAt && now - cached.analyzedAt < GEMINI_FLOOD_TTL_MINUTES * 60 * 1000) {
    return cached;
  }

  const { getAllCameras } = await import("@/lib/cameras");
  const allCameras = getAllCameras();
  const targetCam = allCameras.find((c) => c.CamId === camId);

  // TẦNG 2: WEATHER GATING (1 Giờ TTL)
  // Nếu vệ tinh báo trời nắng ráo (WMO 0-3, precipitation = 0) và không phải điểm nóng ngập -> Trả về LEVEL_0 ngay (⚡ 0 Token)
  const isSunnyAndDry =
    weather &&
    [0, 1, 2, 3].includes(weather.weatherCode) &&
    (weather.precipitation ?? 0) === 0;

  const isHotspot = targetCam ? isFrequentFloodCamera(targetCam) : false;

  if (isSunnyAndDry && !isHotspot) {
    const safeResult: CameraFloodAnalysis = {
      camId,
      floodLevel: "LEVEL_0",
      isRaining: false,
      rainIntensity: "none",
      roadCondition: "dry",
      trafficDensity: "moderate",
      trafficSpeed: "normal",
      description: "Thời tiết khô ráo, tầm nhìn tốt, giao thông thông suốt",
      analyzedAt: cached?.analyzedAt || now,
    };
    await saveToSpatialCacheAndPropagate(camId, safeResult);
    return safeResult;
  }

  // Fetch snapshot if not provided
  let base64 = providedBase64;
  if (!base64 || base64.length < 50) {
    const { fetchCameraSnapshotBase64 } = await import("@/lib/server-camera");
    base64 = (await fetchCameraSnapshotBase64(camId, 6000)) || undefined;
  }

  // TẦNG 3: IMAGE DIFF HASH (So sánh ảnh đứng hình / trùng lặp)
  const imageHash = base64 ? computeImageHash(base64) : undefined;
  const existingEntry = spatialCache.get(camId);

  if (
    imageHash &&
    existingEntry &&
    existingEntry.imageHash === imageHash &&
    now - existingEntry.timestamp < 30 * 60 * 1000 // Trong vòng 30 phút ảnh không đổi
  ) {
    // Tái sử dụng kết quả cũ vì ảnh camera không thay đổi (⚡ 0 Token)
    return {
      ...existingEntry.analysis,
      analyzedAt: now,
    };
  }

  // TẦNG 4: NÉN ẢNH & GỌI GEMINI 2.5 FLASH-LITE
  const results = await analyzeFloodWithGemini(
    [{ camId, imageBase64: base64 || "" }],
    weather ? { [camId]: weather } : undefined
  );

  const finalResult: CameraFloodAnalysis = results[0] || {
    camId,
    floodLevel: "LEVEL_0",
    isRaining: false,
    rainIntensity: "none",
    roadCondition: "dry",
    description: "Tuyến đường thông suốt, không ghi nhận ngập",
    analyzedAt: now,
  };

  // TẦNG 5: LƯU SPATIAL CACHE, SUPABASE & LAN TỎA KHU VỰC
  await saveToSpatialCacheAndPropagate(camId, finalResult, imageHash);

  return finalResult;
}
