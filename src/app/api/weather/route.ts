import { NextRequest, NextResponse } from "next/server";
import { getAggregatedWeatherFloodState, getWmoCategory } from "@/lib/server-weather";
import { CameraWeatherState } from "@/types/camera";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await getAggregatedWeatherFloodState();
    return NextResponse.json({
      success: true,
      count: Object.keys(state.weatherMap).length,
      results: state.weatherMap,
      floodMap: state.floodMap,
      lastUpdated: state.lastUpdated,
    });
  } catch (error: any) {
    console.error("Weather GET API error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

interface CoordItem {
  camId: string;
  lat: number;
  lng: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const items: CoordItem[] = body.items || [];

    if (!Array.isArray(items) || items.length === 0) {
      const state = await getAggregatedWeatherFloodState();
      return NextResponse.json({
        success: true,
        count: Object.keys(state.weatherMap).length,
        results: state.weatherMap,
        floodMap: state.floodMap,
        lastUpdated: state.lastUpdated,
      });
    }

    // Chunk coordinates into batches of 100 to prevent URL length limits
    const CHUNK_SIZE = 100;
    const chunks: CoordItem[][] = [];
    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      chunks.push(items.slice(i, i + CHUNK_SIZE));
    }

    const resultMap: Record<string, CameraWeatherState> = {};
    const now = Date.now();

    // Fetch Open-Meteo in parallel across all chunks
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
            console.error(`Open-Meteo HTTP error: ${res.status}`);
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

            resultMap[cam.camId] = {
              weatherCode,
              precipitation: current.precipitation ?? 0,
              rain: current.rain ?? 0,
              showers: current.showers ?? 0,
              category,
              updatedAt: now,
            };
          });
        } catch (err) {
          console.error("Open-Meteo fetch chunk error:", err);
        }
      })
    );

    return NextResponse.json({
      success: true,
      count: Object.keys(resultMap).length,
      results: resultMap,
    });
  } catch (error: any) {
    console.error("Weather API error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
