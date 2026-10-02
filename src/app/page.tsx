import React, { Suspense } from "react";
import { getAllCameras, getDistricts } from "@/lib/cameras";
import { getAggregatedWeatherFloodState } from "@/lib/server-weather";
import { CameraProvider } from "@/context/CameraContext";
import { WeatherFloodProvider } from "@/context/WeatherFloodContext";
import CameraViewer from "@/components/CameraViewer";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const cameras = getAllCameras();
  const districts = getDistricts();

  // Preload initial weather & flood state on the server (0ms cold start SSR)
  const serverState = await getAggregatedWeatherFloodState().catch(() => null);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm font-medium">Đang nạp hệ thống Camera Giao Thông...</p>
        </div>
      }
    >
      <CameraProvider initialCameras={cameras} districts={districts}>
        <WeatherFloodProvider
          initialWeatherMap={serverState?.weatherMap}
          initialFloodMap={serverState?.floodMap}
          initialLastUpdated={serverState?.lastUpdated}
        >
          <CameraViewer />
        </WeatherFloodProvider>
      </CameraProvider>
    </Suspense>
  );
}
