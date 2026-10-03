import { CameraFloodAnalysis, CameraWeatherState, FloodLevel } from "@/types/camera";
import { getCameraTrafficDensity } from "@/lib/google-traffic";

export interface CameraImageInput {
  camId: string;
  imageBase64: string;
}

const DEFAULT_PROMPT = `You are an expert real-time traffic surveillance and road condition AI. Analyze the street camera images for RAIN, FLOOD conditions, and TRAFFIC DENSITY (vehicle count, congestion, motorcycles and cars).
For each camera image, evaluate:
1. isRaining: true if rain is observed (wet reflective asphalt, raindrops, people wearing raincoats/áo mưa, umbrellas, low visibility from rain), false otherwise.
2. rainIntensity: "none" | "light" | "moderate" | "heavy".
3. floodLevel:
   - "LEVEL_0": Dry road or wet asphalt without water accumulation / safe passage.
   - "LEVEL_1": Minor water pooling ankle-deep / along curb edges (<15cm).
   - "LEVEL_2": Moderate flooding (15cm-40cm) reaching half motorcycle wheel.
   - "LEVEL_3": Deep severe flooding (>40cm) submerging wheels or reaching car bumpers.
   - "UNCLEAR": Camera offline, completely obstructed, or dark night without visibility.
4. roadCondition: "dry" | "wet" | "flooded".
5. trafficDensity:
   - "low": Very few vehicles, empty or clear road, vehicles moving freely at high speed.
   - "moderate": Normal steady flow of motorbikes and cars, moving smoothly.
   - "high": Dense heavy traffic, many motorbikes and cars packed together, moving slowly or bumper-to-bumper.
   - "jam": Severe traffic congestion / gridlock / kẹt xe, vehicles stopped, packed bumper-to-bumper or crawling at standstill.
   CRITICAL: Differentiate traffic density based on visible vehicle volume! Do NOT default all cameras to 'moderate'. If there is a crowd of motorbikes/cars at an intersection or narrow lane, classify as 'high' or 'jam'.
6. trafficSpeed: "fast" | "normal" | "slow" | "standstill".
7. description: A clear, concise Vietnamese sentence describing the rain, flood, road surface, and traffic density state (e.g. "Mặt đường khô ráo, lưu thông thông thoáng", "Xe cộ đông đúc di chuyển chậm", "Đoạn đường đang xảy ra ùn ứ kẹt xe cục bộ").
Return a JSON array of objects matching the schema.`;

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
      floodLevel: isStorm ? "LEVEL_1" : "LEVEL_0",
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
  const configuredModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const configuredFallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash-lite";
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
        floodLevel: "LEVEL_0",
        isRaining: isStorm || isRain,
        rainIntensity: isStorm ? "heavy" : isRain ? "moderate" : "none",
        roadCondition: isStorm || isRain ? "wet" : "dry",
        trafficDensity: traffic.trafficDensity,
        trafficSpeed: traffic.trafficSpeed,
        description: isStorm
          ? "Khu vực có giông bão - Đang kết nối lại luồng hình ảnh"
          : isRain
          ? "Khu vực đang mưa - Đang kết nối lại luồng hình ảnh"
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
        description: "Cảnh báo giông bão - Mặt đường ẩm ướt, có nguy cơ ứ đọng nước cục bộ",
        analyzedAt: now,
      };
    }

    if (isRain) {
      return {
        camId,
        floodLevel: "LEVEL_0",
        isRaining: true,
        rainIntensity: [81, 82, 65].includes(wCode) || precip >= 2 ? "heavy" : "light",
        roadCondition: "wet",
        trafficDensity: traffic.trafficDensity,
        trafficSpeed: traffic.trafficSpeed,
        description: "Có mưa ẩm ướt - Mặt đường trơn trượt, giao thông lưu thông bình thường",
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
      description: "Mặt đường khô ráo, tầm nhìn tốt, giao thông ổn định",
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
    "gemini-2.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
    "gemma-4-26b-a4b-it",
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

    // Build multimodal prompt parts for this batch
    const parts: any[] = [{ text: promptText }];
    for (const item of validBatchItems) {
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
                const floodLevel: FloodLevel = [
                  "LEVEL_0",
                  "LEVEL_1",
                  "LEVEL_2",
                  "LEVEL_3",
                  "UNCLEAR",
                ].includes(resItem.floodLevel)
                  ? resItem.floodLevel
                  : "UNCLEAR";

                const roadCondition = ["dry", "wet", "flooded"].includes(resItem.roadCondition)
                  ? resItem.roadCondition
                  : floodLevel !== "LEVEL_0"
                  ? "flooded"
                  : resItem.isRaining
                  ? "wet"
                  : "dry";

                const fallbackTraffic = estimateTrafficDensity(resItem.camId, Boolean(resItem.isRaining), false);
                const trafficDensity = ["low", "moderate", "high", "jam"].includes(resItem.trafficDensity)
                  ? resItem.trafficDensity
                  : fallbackTraffic.trafficDensity;

                const trafficSpeed = ["fast", "normal", "slow", "standstill"].includes(resItem.trafficSpeed)
                  ? resItem.trafficSpeed
                  : fallbackTraffic.trafficSpeed;

                batchEvaluatedMap.set(resItem.camId, {
                  camId: resItem.camId,
                  floodLevel,
                  isRaining: Boolean(resItem.isRaining),
                  rainIntensity: resItem.rainIntensity || (resItem.isRaining ? "moderate" : "none"),
                  roadCondition,
                  trafficDensity,
                  trafficSpeed,
                  description: resItem.description || "Tuyến đường thông thoáng, xe cộ lưu thông bình thường",
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

  return allResults;
}

/**
 * Analyze a single camera on-demand (e.g. when user opens the Camera Detail Modal).
 * Supports caching and proactive snapshot fetch if imageBase64 is not provided.
 */
export async function analyzeSingleCameraWithGemini(
  camId: string,
  providedBase64?: string,
  weather?: CameraWeatherState
): Promise<CameraFloodAnalysis> {
  let base64 = providedBase64;
  if (!base64 || base64.length < 50) {
    const { fetchCameraSnapshotBase64 } = await import("@/lib/server-camera");
    base64 = (await fetchCameraSnapshotBase64(camId, 6000)) || undefined;
  }

  const results = await analyzeFloodWithGemini(
    [{ camId, imageBase64: base64 || "" }],
    weather ? { [camId]: weather } : undefined
  );

  return (
    results[0] || {
      camId,
      floodLevel: "LEVEL_0",
      isRaining: false,
      rainIntensity: "none",
      roadCondition: "dry",
      description: "Tuyến đường thông suốt, không ghi nhận ngập",
      analyzedAt: Date.now(),
    }
  );
}
