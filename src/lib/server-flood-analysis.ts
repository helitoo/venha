import { CameraFloodAnalysis, CameraWeatherState, FloodLevel } from "@/types/camera";

export interface CameraImageInput {
  camId: string;
  imageBase64: string;
}

const DEFAULT_PROMPT = `Analyze street camera images for flood severity based on real-world reference levels:
LEVEL_0: Dry road or minor wet patches.
LEVEL_1: Ankle-deep / curb-level water (<15cm).
LEVEL_2: Half motorcycle wheel / knee-deep water (15cm-40cm).
LEVEL_3: Submerged motorcycle wheel / car hood-level water (>40cm).
UNCLEAR: Blurry, dark, corrupted, or obstructed view.
Return concise JSON array matching schema.`;

/**
 * Perform server-side flood analysis on camera images using Google Gemini AI.
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
  const configuredModel = process.env.GEMINI_MODEL || "gemma-4-26b-a4b-it";
  const configuredFallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash";
  const promptText = process.env.GEMINI_FLOOD_PROMPT || DEFAULT_PROMPT;
  const mediaResolution = process.env.GEMINI_MEDIA_RESOLUTION || "MEDIA_RESOLUTION_LOW";
  const batchSize = parseInt(process.env.GEMINI_BATCH_SIZE || "35", 10) || 35;

  // Fallback heuristics when Gemini API is not configured or unavailable
  function getHeuristicFlood(camId: string, hasValidImage: boolean): CameraFloodAnalysis {
    const weather = weatherMap ? weatherMap[camId] : undefined;
    const wCode = weather?.weatherCode ?? 0;

    if (!hasValidImage) {
      return {
        camId,
        floodLevel: "LEVEL_0",
        description: "Mất kết nối camera - Đang thử kết nối lại",
        analyzedAt: now,
      };
    }

    if ([95, 96, 99].includes(wCode)) {
      return {
        camId,
        floodLevel: "LEVEL_1",
        description: "Cảnh báo giông bão - Tuyến đường có nguy cơ ngập nhẹ",
        analyzedAt: now,
      };
    }

    if ([80, 81, 82].includes(wCode)) {
      return {
        camId,
        floodLevel: "LEVEL_0",
        description: "Mưa rào diện rộng - Tuyến đường thông suốt",
        analyzedAt: now,
      };
    }

    return {
      camId,
      floodLevel: "LEVEL_0",
      description: "Tuyến đường khô ráo, không ngập",
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
    "gemma-4-26b-a4b-it",
    "gemma-4-31b-it",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-3.8-flash",
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
              floodLevel: {
                type: "STRING",
                enum: ["LEVEL_0", "LEVEL_1", "LEVEL_2", "LEVEL_3", "UNCLEAR"],
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

        if (response.status === 503) {
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

                batchEvaluatedMap.set(resItem.camId, {
                  camId: resItem.camId,
                  floodLevel,
                  description: resItem.description || "Đã phân tích bởi AI",
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
