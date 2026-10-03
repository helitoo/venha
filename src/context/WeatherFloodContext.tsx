"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useCameraContext } from "@/context/CameraContext";
import {
  CameraFloodAnalysis,
  CameraItem,
  CameraWeatherState,
  FloodLevel,
  WeatherCategory,
} from "@/types/camera";

interface WeatherFloodContextType {
  weatherMap: Record<string, CameraWeatherState>;
  floodMap: Record<string, CameraFloodAnalysis>;
  isFetchingWeather: boolean;
  isAnalyzingFlood: boolean;
  lastUpdated: number | null;
  countdown: number;
  floodInterval: number;
  rainyCameraIds: string[];
  severeFloodCount: number;
  moderateFloodCount: number;
  minorFloodCount: number;
  safeCount: number;
  triggerManualCheck: () => void;
  getWeatherInfo: (camId: string) => CameraWeatherState | undefined;
  getFloodInfo: (camId: string) => CameraFloodAnalysis | undefined;
  getMarkerVisualState: (
    cam: CameraItem,
    hasImage?: boolean
  ) => {
    bgColor: string;
    borderColor: string;
    shadowColor: string;
    ringColor: string;
    textColor: string;
    weatherCategory: WeatherCategory;
    floodLevel?: FloodLevel;
    isPulse: boolean;
  };
}

const WeatherFloodContext = createContext<WeatherFloodContextType | null>(null);

// All rainy / drizzle / storm weather codes
export const RAINY_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99,
]);

interface WeatherFloodProviderProps {
  initialWeatherMap?: Record<string, CameraWeatherState>;
  initialFloodMap?: Record<string, CameraFloodAnalysis>;
  initialLastUpdated?: number | null;
  children: React.ReactNode;
}

export function WeatherFloodProvider({
  initialWeatherMap,
  initialFloodMap,
  initialLastUpdated,
  children,
}: WeatherFloodProviderProps) {
  const { allCameras } = useCameraContext();

  const [weatherMap, setWeatherMap] = useState<Record<string, CameraWeatherState>>(
    initialWeatherMap || {}
  );
  const [floodMap, setFloodMap] = useState<Record<string, CameraFloodAnalysis>>(
    initialFloodMap || {}
  );
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [isAnalyzingFlood] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(
    initialLastUpdated || null
  );

  // Interval in seconds from environment variable (default 60s)
  const floodInterval = useMemo(() => {
    const envVal = parseInt(process.env.NEXT_PUBLIC_FLOOD_INTERVAL || "60", 10);
    return isNaN(envVal) || envVal <= 0 ? 60 : envVal;
  }, []);

  // Global Epoch-Synchronized Countdown:
  // All clients everywhere compute the exact same second in real-time
  const getEpochCountdown = useCallback((intervalSec: number) => {
    const currentEpochSec = Math.floor(Date.now() / 1000);
    const remainder = currentEpochSec % intervalSec;
    return intervalSec - remainder;
  }, []);

  const [countdown, setCountdown] = useState<number>(() =>
    getEpochCountdown(floodInterval)
  );

  const isFetchingRef = useRef(false);

  // Fetch precomputed server-side state (SWR cache on server)
  const fetchServerWeatherAndFlood = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsFetchingWeather(true);

    try {
      const res = await fetch("/api/weather");
      if (res.ok) {
        const data = await res.json();
        if (data.results && Object.keys(data.results).length > 0) {
          setWeatherMap((prev) => ({ ...prev, ...data.results }));
        }
        if (data.floodMap && Object.keys(data.floodMap).length > 0) {
          setFloodMap((prev) => ({ ...prev, ...data.floodMap }));
        }
        if (data.lastUpdated) {
          setLastUpdated(data.lastUpdated);
        }
      }
    } catch (err) {
      console.warn("[WeatherFloodContext] Failed to sync weather state:", err);
    } finally {
      setIsFetchingWeather(false);
      isFetchingRef.current = false;
    }
  }, []);

  // Synchronized countdown timer loop
  useEffect(() => {
    // If client booted without initial SSR data, fetch once immediately
    if (Object.keys(weatherMap).length === 0) {
      fetchServerWeatherAndFlood();
    }

    const timer = setInterval(() => {
      const current = getEpochCountdown(floodInterval);
      setCountdown(current);

      // When reaching cycle boundary (e.g. 60s), sync state with server
      if (current === floodInterval) {
        fetchServerWeatherAndFlood();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [floodInterval, getEpochCountdown, fetchServerWeatherAndFlood, weatherMap]);

  // Manual trigger
  const triggerManualCheck = useCallback(() => {
    fetchServerWeatherAndFlood();
  }, [fetchServerWeatherAndFlood]);

  // Helper selectors
  const getWeatherInfo = useCallback(
    (camId: string) => weatherMap[camId],
    [weatherMap]
  );

  const getFloodInfo = useCallback(
    (camId: string) => floodMap[camId],
    [floodMap]
  );

  // List of rainy camera IDs
  const rainyCameraIds = useMemo(() => {
    return Object.entries(weatherMap)
      .filter(
        ([_, w]) =>
          RAINY_WEATHER_CODES.has(w.weatherCode) ||
          (w.precipitation !== undefined && w.precipitation > 0.05) ||
          (w.rain !== undefined && w.rain > 0)
      )
      .map(([id]) => id);
  }, [weatherMap]);

  // Statistics counters
  const severeFloodCount = useMemo(
    () => Object.values(floodMap).filter((f) => f.floodLevel === "LEVEL_3").length,
    [floodMap]
  );

  const moderateFloodCount = useMemo(
    () => Object.values(floodMap).filter((f) => f.floodLevel === "LEVEL_2").length,
    [floodMap]
  );

  const minorFloodCount = useMemo(
    () => Object.values(floodMap).filter((f) => f.floodLevel === "LEVEL_1").length,
    [floodMap]
  );

  const safeCount = useMemo(() => {
    let count = 0;
    allCameras.forEach((c) => {
      const flood = floodMap[c.CamId];
      if (!flood || flood.floodLevel === "LEVEL_0" || flood.floodLevel === "UNCLEAR") {
        count++;
      }
    });
    return count;
  }, [allCameras, floodMap]);

  /**
   * Determine node marker styling based on color scheme:
   * - Mặc định là Màu xanh lá (LEVEL_0, an toàn / bình thường / mọi camera chưa có cảnh báo ngập).
   * - Màu vàng: LEVEL_1 (Ngập nhẹ <15cm).
   * - Màu cam: LEVEL_2 (Ngập vừa 15-40cm).
   * - Màu đỏ: LEVEL_3 (Ngập nặng >40cm).
   */
  const getMarkerVisualState = useCallback(
    (cam: CameraItem) => {
      const weather = weatherMap[cam.CamId];
      const flood = floodMap[cam.CamId];
      const weatherCategory: WeatherCategory = weather ? weather.category : "leaf";

      // 1. Phân cấp mức độ ngập dựa trên kết quả phân tích
      if (flood && flood.floodLevel !== "UNCLEAR") {
        switch (flood.floodLevel) {
          case "LEVEL_3": // Ngập nặng -> Đỏ đậm & nhấp nháy
            return {
              bgColor: "bg-rose-600",
              borderColor: "border-rose-200",
              shadowColor: "shadow-rose-600/80",
              ringColor: "ring-rose-400/60",
              textColor: "text-white",
              weatherCategory,
              floodLevel: "LEVEL_3" as FloodLevel,
              isPulse: true,
            };
          case "LEVEL_2": // Ngập vừa -> Cam đỏ
            return {
              bgColor: "bg-orange-600",
              borderColor: "border-orange-300",
              shadowColor: "shadow-orange-600/60",
              ringColor: "ring-orange-400/50",
              textColor: "text-white",
              weatherCategory,
              floodLevel: "LEVEL_2" as FloodLevel,
              isPulse: false,
            };
          case "LEVEL_1": // Ngập nhẹ -> Vàng cam
            return {
              bgColor: "bg-amber-500",
              borderColor: "border-amber-300",
              shadowColor: "shadow-amber-500/60",
              ringColor: "ring-amber-300/50",
              textColor: "text-slate-950",
              weatherCategory,
              floodLevel: "LEVEL_1" as FloodLevel,
              isPulse: false,
            };
          case "LEVEL_0": // Không ngập (Xanh lá nếu khô ráo, Xanh lam biển nếu có mưa/mưa phùn)
            const isRainCondition =
              weatherCategory === "droplet" ||
              weatherCategory === "cloud-rain" ||
              weatherCategory === "tornado";

            return {
              bgColor: isRainCondition ? "bg-sky-600" : "bg-emerald-600",
              borderColor: isRainCondition ? "border-sky-300" : "border-emerald-200",
              shadowColor: isRainCondition
                ? "shadow-sky-600/60"
                : "shadow-emerald-600/50",
              ringColor: isRainCondition
                ? "ring-sky-400/50"
                : "ring-emerald-400/40",
              textColor: "text-white",
              weatherCategory,
              floodLevel: "LEVEL_0" as FloodLevel,
              isPulse: false,
            };
        }
      }

      // 2. Mặc định cho tất cả các node còn lại -> LEVEL_0
      const isRainConditionDefault =
        weatherCategory === "droplet" ||
        weatherCategory === "cloud-rain" ||
        weatherCategory === "tornado";

      return {
        bgColor: isRainConditionDefault ? "bg-sky-600" : "bg-emerald-600",
        borderColor: isRainConditionDefault ? "border-sky-300" : "border-emerald-200",
        shadowColor: isRainConditionDefault
          ? "shadow-sky-600/60"
          : "shadow-emerald-600/50",
        ringColor: isRainConditionDefault
          ? "ring-sky-400/50"
          : "ring-emerald-400/40",
        textColor: "text-white",
        weatherCategory,
        floodLevel: "LEVEL_0" as FloodLevel,
        isPulse: false,
      };
    },
    [weatherMap, floodMap]
  );

  return (
    <WeatherFloodContext.Provider
      value={{
        weatherMap,
        floodMap,
        isFetchingWeather,
        isAnalyzingFlood,
        lastUpdated,
        countdown,
        floodInterval,
        rainyCameraIds,
        severeFloodCount,
        moderateFloodCount,
        minorFloodCount,
        safeCount,
        triggerManualCheck,
        getWeatherInfo,
        getFloodInfo,
        getMarkerVisualState,
      }}
    >
      {children}
    </WeatherFloodContext.Provider>
  );
}

export function useWeatherFloodContext() {
  const ctx = useContext(WeatherFloodContext);
  if (!ctx) {
    throw new Error(
      "useWeatherFloodContext must be used within a WeatherFloodProvider"
    );
  }
  return ctx;
}
