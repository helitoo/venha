import { NextRequest, NextResponse } from "next/server";
import {
  analyzeFloodWithGemini,
  analyzeSingleCameraWithGemini,
  CameraImageInput,
} from "@/lib/server-flood-analysis";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    // 1. Single Camera On-Demand Analysis (e.g. from Camera Modal)
    if (body.camId) {
      const result = await analyzeSingleCameraWithGemini(
        body.camId,
        body.imageBase64,
        body.weather
      );
      return NextResponse.json({
        success: true,
        result,
      });
    }

    // 2. Batch Multimodal Analysis
    const items: CameraImageInput[] = body.items || [];
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: true, results: [] });
    }

    const results = await analyzeFloodWithGemini(items);

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error: any) {
    console.error("Flood analysis API error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Analysis error" },
      { status: 500 }
    );
  }
}

