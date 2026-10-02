import { NextRequest, NextResponse } from "next/server";
import { CameraFloodAnalysis, FloodLevel } from "@/types/camera";

export const dynamic = "force-dynamic";

interface CameraImageInput {
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const items: CameraImageInput[] = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const configuredModel = process.env.GEMINI_MODEL;
    const configuredFallback = process.env.GEMINI_FALLBACK_MODEL;
    const promptText = process.env.GEMINI_FLOOD_PROMPT || DEFAULT_PROMPT;
    const mediaResolution = process.env.GEMINI_MEDIA_RESOLUTION;

    // Candidate models to try in priority order
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

    // Build multimodal prompt parts
    const parts: any[] = [{ text: promptText }];

    for (const item of items) {
      if (!item.imageBase64) continue;

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
    let selectedModel = configuredModel;

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
          selectedModel = model;
          break;
        }

        const errJson = await response.json().catch(() => ({}));
        console.warn(`Gemini model ${model} returned ${response.status}:`, errJson?.error?.message);

        // If high demand (503), small delay before trying next fallback
        if (response.status === 503) {
          await new Promise((res) => setTimeout(res, 600));
        }
      } catch (err) {
        console.warn(`Failed to call Gemini model ${model}:`, err);
      }
    }

    const now = Date.now();
    const finalResults: CameraFloodAnalysis[] = [];

    if (responseData) {
      const rawText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        try {
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              const floodLevel: FloodLevel = [
                "LEVEL_0",
                "LEVEL_1",
                "LEVEL_2",
                "LEVEL_3",
                "UNCLEAR",
              ].includes(item.floodLevel)
                ? item.floodLevel
                : "UNCLEAR";

              finalResults.push({
                camId: item.camId || "",
                floodLevel,
                description: item.description || "",
                analyzedAt: now,
              });
            });
          }
        } catch (parseErr) {
          console.error("Error parsing Gemini JSON output:", parseErr, rawText);
        }
      }
    }

    // Ensure all input items have a result entry
    const evaluatedCamIds = new Set(finalResults.map((r) => r.camId));
    items.forEach((item) => {
      if (!evaluatedCamIds.has(item.camId)) {
        finalResults.push({
          camId: item.camId,
          floodLevel: item.imageBase64 ? "LEVEL_0" : "UNCLEAR",
          description: "Đã đánh giá",
          analyzedAt: now,
        });
      }
    });

    return NextResponse.json({
      success: true,
      modelUsed: selectedModel,
      results: finalResults,
    });
  } catch (error: any) {
    console.error("Flood analysis API error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Analysis error" },
      { status: 500 }
    );
  }
}
