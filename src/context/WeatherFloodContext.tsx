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

// Rain codes triggering Gemini Flood Analysis
const RAINY_WEATHER_CODES = new Set([80, 81, 82, 95, 96, 99]);
// Light / Moderate Rain codes that auto-resolve to LEVEL_0 (không ngập)
const LIGHT_RAIN_CODES = new Set([61, 63, 65]);

// Haversine distance formula in kilometers
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function WeatherFloodProvider({ children }: { children: React.ReactNode }) {
  const { allCameras, getStreamState, getActiveViewportCamIds } = useCameraContext();

  const [weatherMap, setWeatherMap] = useState<Record<string, CameraWeatherState>>({});
  const [floodMap, setFloodMap] = useState<Record<string, CameraFloodAnalysis>>({});
  const [isFetchingWeather, setIsFetchingWeather] = useState(false);
  const [isAnalyzingFlood, setIsAnalyzingFlood] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Interval in seconds from environment variable (default 60s)
  const floodInterval = useMemo(() => {
    const envVal = parseInt(process.env.NEXT_PUBLIC_FLOOD_INTERVAL || "60", 10);
    return isNaN(envVal) || envVal <= 0 ? 60 : envVal;
  }, []);

  // Spatial sampling radius in km (default 5km)
  const sampleRadiusKm = useMemo(() => {
    const envVal = parseFloat(process.env.NEXT_PUBLIC_WEATHER_SAMPLE_RADIUS_KM || "5");
    return isNaN(envVal) || envVal <= 0 ? 5 : envVal;
  }, []);

  const [countdown, setCountdown] = useState<number>(floodInterval);

  const allCamerasRef = useRef(allCameras);
  allCamerasRef.current = allCameras;

  const getStreamStateRef = useRef(getStreamState);
  getStreamStateRef.current = getStreamState;

  const getActiveViewportCamIdsRef = useRef(getActiveViewportCamIds);
  getActiveViewportCamIdsRef.current = getActiveViewportCamIds;

  const floodIntervalRef = useRef(floodInterval);
  floodIntervalRef.current = floodInterval;

  const isExecutingRef = useRef<boolean>(false);

  // Convert an already loaded image URL or image element to base64
  const getImageBase64FromUrl = useCallback(async (imgUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            // Downscale image slightly for MEDIA_RESOLUTION_LOW
            const maxDimension = 512;
            let width = img.width || 640;
            let height = img.height || 360;

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
              } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              resolve(null);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
            resolve(dataUrl);
          } catch {
            resolve(null);
          }
        };
        img.onerror = () => {
          resolve(null);
        };
        img.src = imgUrl;
      } catch {
        resolve(null);
      }
    });
  }, []);

  // Primary execution: Fetch Open-Meteo weather & analyze flood with Gemini for Viewport Cameras
  const executeWeatherAndFloodWorkflow = useCallback(async () => {
    if (isExecutingRef.current) return;

    isExecutingRef.current = true;
    setCountdown(floodIntervalRef.current);
    setIsFetchingWeather(true);

    try {
      const currentCams = allCamerasRef.current;
      // 1. Filter all valid cameras with GPS
      const validCams = currentCams.filter(
        (c) => typeof c.Lat === "number" && typeof c.Lng === "number" && !isNaN(c.Lat) && !isNaN(c.Lng)
      );

      if (validCams.length === 0) {
        setIsFetchingWeather(false);
        isExecutingRef.current = false;
        return;
      }

      // Filter cameras currently in Viewport
      const viewportIds = new Set(
        getActiveViewportCamIdsRef.current ? getActiveViewportCamIdsRef.current() : []
      );
      
      const targetCams =
        viewportIds.size > 0
          ? validCams.filter((c) => viewportIds.has(c.CamId))
          : validCams;

      if (targetCams.length === 0) {
        setIsFetchingWeather(false);
        isExecutingRef.current = false;
        return;
      }

      // 2. Spatial Clustering: Group target cameras in viewport and select 1 representative per cluster
      const clusters: Array<{ representative: CameraItem; members: CameraItem[] }> = [];
      const visited = new Set<string>();

      for (const cam of targetCams) {
        if (visited.has(cam.CamId)) continue;
        visited.add(cam.CamId);

        const members: CameraItem[] = [cam];
        for (const other of targetCams) {
          if (visited.has(other.CamId)) continue;
          const dist = getDistanceKm(cam.Lat!, cam.Lng!, other.Lat!, other.Lng!);
          if (dist <= sampleRadiusKm) {
            visited.add(other.CamId);
            members.push(other);
          }
        }
        clusters.push({ representative: cam, members });
      }

      // 3. Only fetch Open-Meteo for representative cameras in viewport
      const repCoordItems = clusters.map((cl) => ({
        camId: cl.representative.CamId,
        lat: cl.representative.Lat!,
        lng: cl.representative.Lng!,
      }));

      const weatherRes = await fetch("/api/weather", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: repCoordItems }),
      });

      let updatedWeatherMap: Record<string, CameraWeatherState> = {};
      if (weatherRes.ok) {
        const weatherJson = await weatherRes.json();
        const repResults: Record<string, CameraWeatherState> = weatherJson.results || {};

        // 4. Propagate representative weather state to all cameras within its cluster radius
        clusters.forEach((cl) => {
          const repW = repResults[cl.representative.CamId];
          if (repW) {
            cl.members.forEach((m) => {
              updatedWeatherMap[m.CamId] = {
                ...repW,
              };
            });
          }
        });

        setWeatherMap((prev) => ({ ...prev, ...updatedWeatherMap }));
      }
      setIsFetchingWeather(false);

      // Auto-assign flood level:
      // - Codes 80, 81, 82, 95, 96, 99 VÀ CÓ ẢNH -> Fetch Gemini AI flood analysis
      // - Các camera còn lại trong viewport -> Mặc định gán LEVEL_0 (Xanh lá - Không ngập / Khô ráo)
      const autoFloodMap: Record<string, CameraFloodAnalysis> = {};
      const rainyCamsWithImages: CameraItem[] = [];

      targetCams.forEach((cam) => {
        const w = updatedWeatherMap[cam.CamId] || weatherMap[cam.CamId];
        const isSevereRain = w && RAINY_WEATHER_CODES.has(w.weatherCode);

        if (isSevereRain) {
          const streamState = getStreamStateRef.current(cam.CamId);
          if (streamState?.currentImgSrc && !streamState.hasError) {
            rainyCamsWithImages.push(cam);
          } else {
            autoFloodMap[cam.CamId] = {
              camId: cam.CamId,
              floodLevel: "LEVEL_0",
              description: "Chưa có ảnh camera - Tuyến đường mặc định thông suốt",
              analyzedAt: Date.now(),
            };
          }
        } else {
          // Các camera còn lại (mã 61/63/65 hoặc thời tiết bình thường) -> LEVEL_0
          autoFloodMap[cam.CamId] = {
            camId: cam.CamId,
            floodLevel: "LEVEL_0",
            description: "Thời tiết thông thoáng - Tuyến đường khô ráo, không ngập",
            analyzedAt: Date.now(),
          };
        }
      });

      // Update auto flood results immediately
      setFloodMap((prev) => ({ ...prev, ...autoFloodMap }));

      // If no heavy rain / storm cameras with images in viewport, finish workflow
      if (rainyCamsWithImages.length === 0) {
        setLastUpdated(Date.now());
        isExecutingRef.current = false;
        return;
      }

      // Collect existing images for rainy cameras
      setIsAnalyzingFlood(true);
      const imagesToAnalyze: Array<{ camId: string; imageBase64: string }> = [];

      for (const cam of rainyCamsWithImages) {
        const streamState = getStreamStateRef.current(cam.CamId);
        if (streamState?.currentImgSrc && !streamState.hasError) {
          const base64 = await getImageBase64FromUrl(streamState.currentImgSrc);
          if (base64) {
            imagesToAnalyze.push({
              camId: cam.CamId,
              imageBase64: base64,
            });
          }
        }
      }

      if (imagesToAnalyze.length === 0) {
        setIsAnalyzingFlood(false);
        setLastUpdated(Date.now());
        isExecutingRef.current = false;
        return;
      }

      // Micro-batching: send in parallel to Gemini API
      const BATCH_SIZE = 35;
      const batches: Array<Array<{ camId: string; imageBase64: string }>> = [];
      for (let i = 0; i < imagesToAnalyze.length; i += BATCH_SIZE) {
        batches.push(imagesToAnalyze.slice(i, i + BATCH_SIZE));
      }

      const batchResponses = await Promise.all(
        batches.map(async (batch) => {
          try {
            const res = await fetch("/api/flood-analysis", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: batch }),
            });
            if (res.ok) {
              const data = await res.json();
              return data.results || [];
            }
            return [];
          } catch (e) {
            console.error("Batch flood analysis failed:", e);
            return [];
          }
        })
      );

      // Merge analysis results into floodMap
      const newFloodResults: Record<string, CameraFloodAnalysis> = {};
      batchResponses.flat().forEach((analysis: CameraFloodAnalysis) => {
        if (analysis && analysis.camId) {
          newFloodResults[analysis.camId] = analysis;
        }
      });

      setFloodMap((prev) => ({ ...prev, ...newFloodResults }));
      setLastUpdated(Date.now());
    } catch (error) {
      console.error("Workflow execution error:", error);
    } finally {
      setIsFetchingWeather(false);
      setIsAnalyzingFlood(false);
      isExecutingRef.current = false;
    }
  }, [getImageBase64FromUrl, sampleRadiusKm, weatherMap]);

  const executeWorkflowRef = useRef(executeWeatherAndFloodWorkflow);
  executeWorkflowRef.current = executeWeatherAndFloodWorkflow;

  // Periodic timer adhering to NEXT_PUBLIC_FLOOD_INTERVAL
  useEffect(() => {
    if (allCameras.length === 0) return;

    // Initial run on mount
    executeWorkflowRef.current();

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          executeWorkflowRef.current();
          return floodInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [allCameras.length, floodInterval]);

  // Manual check trigger
  const triggerManualCheck = useCallback(() => {
    setCountdown(floodInterval);
    executeWeatherAndFloodWorkflow();
  }, [executeWeatherAndFloodWorkflow, floodInterval]);

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
      .filter(([_, w]) => RAINY_WEATHER_CODES.has(w.weatherCode))
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
   * - Màu cam: LEVEL_1 (Ngập nhẹ <15cm).
   * - Màu cam đỏ: LEVEL_2 (Ngập vừa 15-40cm).
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
          case "LEVEL_1": // Ngập nhẹ -> Cam
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
          case "LEVEL_0": // Không ngập -> Xanh lá
            return {
              bgColor: "bg-emerald-600",
              borderColor: "border-emerald-200",
              shadowColor: "shadow-emerald-600/50",
              ringColor: "ring-emerald-400/40",
              textColor: "text-white",
              weatherCategory,
              floodLevel: "LEVEL_0" as FloodLevel,
              isPulse: false,
            };
        }
      }

      // 2. Mặc định cho tất cả các node còn lại -> MÀU XANH LÁ (LEVEL_0)
      return {
        bgColor: "bg-emerald-600",
        borderColor: "border-emerald-200",
        shadowColor: "shadow-emerald-600/50",
        ringColor: "ring-emerald-400/40",
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
    throw new Error("useWeatherFloodContext must be used within a WeatherFloodProvider");
  }
  return ctx;
}
