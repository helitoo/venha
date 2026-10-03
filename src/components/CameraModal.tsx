"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CameraItem, CameraFloodAnalysis } from "@/types/camera";
import { MascotMood } from "@/types/mascot";
import { useCameraContext, useCameraStream } from "@/context/CameraContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import { useMascotContext } from "@/context/MascotContext";
import { getCameraTrafficDensity } from "@/lib/google-traffic";
import { getMascotEmotionTitle } from "@/data/mascotQuotes";
import { GEMINI_FLOOD_TTL_MINUTES } from "@/config/constants";
import {
  X,
  MapPin,
  RefreshCw,
  ExternalLink,
  Droplet,
  CloudRain,
  Tornado,
  Camera,
  ShieldAlert,
  Sparkles,
  Copy,
  Check,
  Clock,
  Compass,
  CheckCircle2,
  Car,
  Activity,
  AlertTriangle,
  Video,
} from "lucide-react";

interface CameraModalProps {
  camera: CameraItem | null;
  onClose: () => void;
}

export default function CameraModal({ camera, onClose }: CameraModalProps) {
  const { refreshInterval, setRefreshInterval } = useCameraContext();

  // If camera is null, render nothing
  if (!camera) return null;

  return (
    <CameraModalContent
      camera={camera}
      onClose={onClose}
      refreshInterval={refreshInterval}
      setRefreshInterval={setRefreshInterval}
    />
  );
}

const CLIENT_CACHE_KEY_PREFIX = "venha_cam_flood_";
const CLIENT_CACHE_TTL_MS = GEMINI_FLOOD_TTL_MINUTES * 60 * 1000; // 20 minutes

function getClientFloodCache(camId: string): CameraFloodAnalysis | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CLIENT_CACHE_KEY_PREFIX}${camId}`);
    if (!raw) return null;
    const item = JSON.parse(raw);
    if (Date.now() - (item.analyzedAt || 0) < CLIENT_CACHE_TTL_MS) {
      return item;
    }
  } catch {
    // ignore
  }
  return null;
}

function setClientFloodCache(camId: string, data: CameraFloodAnalysis) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${CLIENT_CACHE_KEY_PREFIX}${camId}`, JSON.stringify(data));
  } catch {
    // ignore
  }
}

function CameraModalContent({
  camera,
  onClose,
  refreshInterval,
}: {
  camera: CameraItem;
  onClose: () => void;
  refreshInterval: number;
  setRefreshInterval: (sec: number) => void;
}) {
  // Subscribe to stream state from Context
  const { stream, refresh } = useCameraStream(camera.CamId);
  const { getWeatherInfo, getFloodInfo } = useWeatherFloodContext();
  const { mascotType, getMascotImage } = useMascotContext();

  const weather = getWeatherInfo(camera.CamId);
  const contextFlood = getFloodInfo(camera.CamId);

  // Local state for on-demand AI analysis & UI interactions with instant Client-Side Cache
  const [isAnalyzingAI, setIsAnalyzingAI] = useState(false);
  const [customFloodResult, setCustomFloodResult] = useState<CameraFloodAnalysis | null>(() =>
    getClientFloodCache(camera.CamId)
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [currentTimeStr, setCurrentTimeStr] = useState("");
  const [imgLoadError, setImgLoadError] = useState(false);

  const effectiveFlood: CameraFloodAnalysis | undefined = customFloodResult || contextFlood;

  // Prevent background scrolling while modal is open
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      setCurrentTimeStr(
        d.toLocaleTimeString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // On-demand AI Analysis Trigger
  const handleTriggerAI = useCallback(async () => {
    if (isAnalyzingAI) return;
    setIsAnalyzingAI(true);
    try {
      const res = await fetch("/api/flood-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          camId: camera.CamId,
          weather: weather,
        }),
      });
      const data = await res.json();
      if (data.success && data.result) {
        setCustomFloodResult(data.result);
        setClientFloodCache(camera.CamId, data.result);
      }
    } catch (err) {
      console.error("[CameraModal] On-demand AI scan error:", err);
    } finally {
      setIsAnalyzingAI(false);
    }
  }, [camera.CamId, isAnalyzingAI, weather]);

  // Auto-scan on camera open if no fresh scan exists (within 20 minutes)
  const hasAutoScannedRef = React.useRef(false);
  useEffect(() => {
    if (hasAutoScannedRef.current) return;
    const now = Date.now();
    const isStaleOrMissing =
      !effectiveFlood ||
      !effectiveFlood.analyzedAt ||
      now - effectiveFlood.analyzedAt > GEMINI_FLOOD_TTL_MINUTES * 60 * 1000;

    if (isStaleOrMissing && !isAnalyzingAI) {
      hasAutoScannedRef.current = true;
      handleTriggerAI();
    }
  }, [effectiveFlood, handleTriggerAI, isAnalyzingAI]);

  // Copy URL
  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(`${window.location.origin}/camera/${camera.CamId}`);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Derive real-time traffic density and speed with Google Maps traffic flow
  const trafficInfo = useMemo(() => {
    return getCameraTrafficDensity(camera, effectiveFlood);
  }, [camera, effectiveFlood]);

  const trafficDensity = trafficInfo.level;
  const trafficMeta = trafficInfo.meta;

  // Compute mascot warning text based on flood, weather, and traffic
  const mascotTip = useMemo(() => {
    const isDuck = mascotType === "duck";
    const name = isDuck ? "Bé Vịt" : "Bé Mèo";
    const currentHour = new Date().getHours();
    const isNightSleep = currentHour >= 22 || currentHour < 5;

    if (effectiveFlood?.floodLevel === "LEVEL_3") {
      return `${name}: "Báo động đỏ! Điểm này ngập sâu hơn 40cm, xe máy tuyệt đối không nên cố đi qua nha!"`;
    }
    if (effectiveFlood?.floodLevel === "LEVEL_2") {
      return `${name}: "Ngập đến nửa bánh xe rồi nè! Hãy chạy chậm hoặc tìm đường vòng cao ráo hơn nha!"`;
    }
    if (effectiveFlood?.floodLevel === "LEVEL_1") {
      return `${name}: "Nước đang đọng mép đường, trời mưa trơn trượt. Chú ý giữ khoảng cách an toàn nhé!"`;
    }
    if (effectiveFlood?.isRaining) {
      return `${name}: "Đường ướt mưa nhưng chưa ngập đâu, nhớ mặc áo mưa cẩn thận và đi chậm lại nha!"`;
    }
    if (isNightSleep) {
      return isDuck
        ? `${name}: "Khuya rồi, đường phố vắng vẻ thông thoáng. Nếu còn ở ngoài đường nhớ chạy xe cẩn thận và về nhà ngủ sớm nha bạn ơi 🦆🌙"`
        : `${name}: "Đêm muộn đường vắng tanh rồi meow! Sen về tới nhà nhớ khóa cửa, đắp chăn đi ngủ sớm giữ sức khỏe nha 🐱💤"`;
    }
    if (trafficDensity === "jam") {
      return `${name}: "Khu vực này đang ùn tắc, kẹt xe khá nghiêm trọng! Bạn nên chọn đường khác đi vòng nha!"`;
    }
    if (trafficDensity === "high") {
      return `${name}: "Đoạn đường này xe cộ đang khá đông đúc và di chuyển chậm, bạn nhớ giữ đều ga và quan sát kỹ nhé!"`;
    }
    if (trafficDensity === "low") {
      return isDuck
        ? `${name}: "Đoạn đường này đang rất thông thoáng, xe cộ vắng vẻ tha hồ vi vu bạn ơi 🦆🛵"`
        : `${name}: "Đoạn đường này đang rất thông thoáng, xe cộ vắng vẻ chạy bon bon meow 🐱🛵"`;
    }
    return `${name}: "Mặt đường thông thoáng và khô ráo! Lộ trình an toàn để di chuyển rồi đấy!"`;
  }, [effectiveFlood, mascotType, trafficDensity]);

  const currentHour = new Date().getHours();
  const isNightSleep = currentHour >= 22 || currentHour < 5;

  const mascotMoodForModal: MascotMood =
    effectiveFlood?.floodLevel === "LEVEL_3" || effectiveFlood?.floodLevel === "LEVEL_2"
      ? "flood"
      : effectiveFlood?.isRaining
      ? "rain"
      : isNightSleep
      ? "sleep"
      : "sunny";

  const mascotAvatar = getMascotImage(mascotMoodForModal);

  const handleManualRefresh = () => {
    setImgLoadError(false);
    refresh();
  };

  const isStreamFailed = (stream.hasError || imgLoadError) && !stream.currentImgSrc;

  return (
    <>
      {/* 1. Backdrop Overlay (Click outside to close) */}
      <div
        className="fixed inset-0 z-[99990] bg-black/40 dark:bg-black/60 backdrop-blur-[2px] transition-opacity duration-300 animate-fadeIn"
        onClick={onClose}
        aria-label="Đóng cửa sổ"
      />

      {/* 2. Side Right Bar (Laptop/Desktop) OR Fullscreen Modal (Mobile) */}
      <div
        className="fixed inset-0 md:inset-auto md:top-3 md:bottom-3 md:right-3 lg:top-4 lg:bottom-4 lg:right-4 z-[99995] w-full md:w-[480px] lg:w-[500px] xl:w-[520px] max-w-full md:max-w-[520px] bg-white dark:bg-slate-900 md:rounded-3xl border-0 md:border md:border-slate-200/90 md:dark:border-slate-800 shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-6 md:slide-in-from-right duration-300 overflow-hidden font-sans select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70 shrink-0">
          <div className="flex flex-col min-w-0 pr-2">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">{camera.CamName}</span>
            </h2>
            <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-nowrap overflow-x-auto scrollbar-none">
              <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300 shrink-0 whitespace-nowrap">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span>{camera.District || camera.Disctrict || "TP.HCM"}</span>
              </span>
              <span className="text-slate-300 dark:text-slate-700 shrink-0">•</span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                ID: {camera.CamId}
              </span>

              {weather && (
                <>
                  <span className="text-slate-300 dark:text-slate-700 shrink-0">•</span>
                  <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-medium shrink-0 whitespace-nowrap">
                    {weather.category === "tornado" ? (
                      <Tornado className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                    ) : weather.category === "cloud-rain" ? (
                      <CloudRain className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    ) : weather.category === "droplet" ? (
                      <Droplet className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    ) : (
                      <Camera className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    <span>WMO: {weather.weatherCode}</span>
                  </span>
                </>
              )}

              {currentTimeStr && (
                <>
                  <span className="text-slate-300 dark:text-slate-700 shrink-0">•</span>
                  <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
                    <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span>{currentTimeStr}</span>
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              title="Đóng cửa sổ (phím Esc)"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition active:scale-95 border border-slate-200 dark:border-slate-700/60 cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SCROLLABLE CONTENT BODY */}
        <div className="overflow-y-auto flex-1 p-3.5 sm:p-4 space-y-3.5">
          {/* A. SNAPSHOT STREAM VIEWPORT WITH SKELETON & ERROR FALLBACK */}
          <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner group flex items-center justify-center">
            {/* Skeleton Loading State */}
            {stream.isInitialLoading && !stream.currentImgSrc && !isStreamFailed && (
              <div className="absolute inset-0 bg-slate-900/90 animate-pulse flex flex-col items-center justify-center text-slate-400 gap-2 z-10">
                <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-cyan-400 animate-bounce">
                  <Video className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>Đang nạp luồng camera trực tiếp...</span>
                </div>
              </div>
            )}

            {/* Error Fallback with Retry */}
            {isStreamFailed ? (
              <div className="absolute inset-0 bg-slate-900/95 flex flex-col items-center justify-center text-center p-4 gap-2 z-20">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center border border-rose-500/20">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-200">
                    Không có tín hiệu camera
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Hệ thống máy chủ giao thông tạm ngắt hoặc đường truyền bận
                  </p>
                </div>
                <button
                  onClick={handleManualRefresh}
                  className="mt-1 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition active:scale-95 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${stream.isFetching ? "animate-spin" : ""}`} />
                  <span>Thử tải lại</span>
                </button>
              </div>
            ) : null}

            {/* Live Camera Snapshot Image */}
            {stream.currentImgSrc && !isStreamFailed && (
              <img
                src={stream.currentImgSrc}
                alt={camera.CamName}
                onError={() => setImgLoadError(true)}
                className="w-full h-full object-cover transition-opacity duration-300"
              />
            )}

            {/* Top-left LIVE Badge */}
            <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none z-10 flex-nowrap">
              <span className="px-2.5 py-0.5 rounded-full bg-red-600/90 text-white text-[10px] sm:text-[11px] font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md shrink-0 whitespace-nowrap">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                TRỰC TIẾP
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-900/80 text-slate-200 text-[10px] font-medium backdrop-blur-md shrink-0 whitespace-nowrap">
                {camera.District || "TP.HCM"}
              </span>
            </div>

            {/* Top-right In-Viewport Refresh Button */}
            <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
              {stream.isFetching && (
                <div className="bg-black/75 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] text-cyan-400 flex items-center gap-1.5 font-medium shrink-0 whitespace-nowrap shadow-md">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Cập nhật...</span>
                </div>
              )}
              <button
                onClick={handleManualRefresh}
                title="Làm mới ảnh ngay"
                className="p-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-slate-200 hover:text-white transition active:scale-90 border border-white/10 cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${stream.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* B. DIAGNOSTIC ROAD & FLOOD METRICS */}
          <div className="relative rounded-2xl p-3 sm:p-3.5 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/60 border border-slate-200 dark:border-cyan-500/30 shadow-md">
            {/* Panel Header */}
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200 dark:border-slate-800/80 flex-wrap gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shrink-0">
                  <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-nowrap">
                    <span className="truncate">Đánh giá mặt đường & ngập</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[9px] sm:text-[10px] font-bold shrink-0 whitespace-nowrap">
                      Thời gian thực
                    </span>
                  </h3>
                </div>
              </div>

              {/* Timestamp Badge */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200/80 dark:border-cyan-900/60 text-cyan-700 dark:text-cyan-300 text-[11px] font-semibold shrink-0 whitespace-nowrap">
                {isAnalyzingAI ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>Đang cập nhật...</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                    <span>
                      {effectiveFlood?.analyzedAt
                        ? new Date(effectiveFlood.analyzedAt).toLocaleTimeString("vi-VN", {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })
                        : "Thời gian thực"}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Diagnostic Metrics Grid (2x2 Grid) */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              {/* Metric 1: Rain */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <CloudRain className="w-3 h-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                  <span>Trời mưa</span>
                </span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      effectiveFlood?.isRaining ? "bg-cyan-500 animate-ping" : "bg-slate-400"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0 whitespace-nowrap">
                    {effectiveFlood?.isRaining ? "🌧️ Đang có mưa" : "☀️ Không mưa"}
                  </span>
                </div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {effectiveFlood?.rainIntensity === "heavy"
                    ? "Mưa to / giông"
                    : effectiveFlood?.rainIntensity === "moderate"
                    ? "Mưa rào vừa"
                    : effectiveFlood?.rainIntensity === "light"
                    ? "Mưa phùn nhẹ"
                    : "Khô ráo"}
                </span>
              </div>

              {/* Metric 2: Flood Level */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <ShieldAlert className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                  <span>Mức độ ngập</span>
                </span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      effectiveFlood?.floodLevel === "LEVEL_3"
                        ? "bg-rose-500 animate-pulse"
                        : effectiveFlood?.floodLevel === "LEVEL_2"
                        ? "bg-orange-500"
                        : effectiveFlood?.floodLevel === "LEVEL_1"
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0 whitespace-nowrap">
                    {effectiveFlood?.floodLevel === "LEVEL_3"
                      ? "🔴 Ngập nặng (>40cm)"
                      : effectiveFlood?.floodLevel === "LEVEL_2"
                      ? "🟠 Ngập vừa"
                      : effectiveFlood?.floodLevel === "LEVEL_1"
                      ? "🟡 Ngập nhẹ"
                      : "🟢 Không ngập"}
                  </span>
                </div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {effectiveFlood?.floodLevel === "LEVEL_0"
                    ? "Giao thông an toàn"
                    : "Chú ý tay lái"}
                </span>
              </div>

              {/* Metric 3: Road Surface */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 shrink-0 whitespace-nowrap">
                  <Compass className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Mặt đường</span>
                </span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0 whitespace-nowrap">
                    {effectiveFlood?.roadCondition === "flooded"
                      ? "🌊 Bị ngập nước"
                      : effectiveFlood?.roadCondition === "wet"
                      ? "💧 Ẩm ướt"
                      : "✨ Khô ráo"}
                  </span>
                </div>
                <span className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {effectiveFlood?.roadCondition === "flooded"
                    ? "Cảnh báo ngập đọng"
                    : effectiveFlood?.roadCondition === "wet"
                    ? "Chú ý mặt đường trơn"
                    : "Thông suốt"}
                </span>
              </div>

              {/* Metric 4: Traffic Density */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 flex flex-col justify-between shadow-2xs">
                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between shrink-0 whitespace-nowrap">
                  <span className="flex items-center gap-1">
                    <Car className="w-3 h-3 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Mật độ xe</span>
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 shrink-0">
                    {trafficMeta.speedEstimate}
                  </span>
                </span>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${trafficMeta.dotColor}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 shrink-0 whitespace-nowrap">
                    {trafficMeta.label}
                  </span>
                </div>
                <div className="mt-1 w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${trafficMeta.barColor} ${trafficMeta.barPercent}`}
                  />
                </div>
              </div>
            </div>

            {/* AI Diagnosis Quote */}
            <div className="bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-2.5 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {effectiveFlood?.description || "Tuyến đường thông thoáng, không phát hiện ngập úng."}
                </p>
              </div>
            </div>
          </div>

          {/* C. MASCOT COMMENTARY CARD */}
          <div
            className={`border rounded-2xl p-3 flex items-center gap-3 shadow-2xs transition-all ${
              mascotMoodForModal === "sleep"
                ? "bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-900/50"
                : mascotMoodForModal === "flood"
                ? "bg-rose-50/70 dark:bg-rose-950/40 border-rose-200/70 dark:border-rose-900/40"
                : mascotMoodForModal === "rain"
                ? "bg-cyan-50/70 dark:bg-cyan-950/40 border-cyan-200/70 dark:border-cyan-900/40"
                : "bg-amber-50/70 dark:bg-slate-900/60 border-amber-200/70 dark:border-slate-800"
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl p-0.5 shrink-0 flex items-center justify-center shadow-xs border ${
                mascotMoodForModal === "sleep"
                  ? "bg-indigo-100/80 dark:bg-indigo-900/60 border-indigo-200 dark:border-indigo-700/60"
                  : "bg-white dark:bg-slate-800 border-amber-200 dark:border-amber-500/20"
              }`}
            >
              <img src={mascotAvatar} alt="Mascot" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[10px] font-bold flex items-center gap-1.5 flex-nowrap ${
                  mascotMoodForModal === "sleep"
                    ? "text-indigo-600 dark:text-indigo-300"
                    : mascotMoodForModal === "flood"
                    ? "text-rose-600 dark:text-rose-400"
                    : mascotMoodForModal === "rain"
                    ? "text-cyan-600 dark:text-cyan-300"
                    : "text-amber-600 dark:text-amber-400"
                }`}
              >
                <span className="truncate">
                  {getMascotEmotionTitle(mascotType, {
                    floodLevel: effectiveFlood?.floodLevel,
                    isRaining: effectiveFlood?.isRaining,
                    rainIntensity: effectiveFlood?.rainIntensity,
                    trafficDensity,
                    roadCondition: effectiveFlood?.roadCondition,
                    mood: mascotMoodForModal,
                  })}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded-full shrink-0 whitespace-nowrap ${
                    mascotMoodForModal === "sleep"
                      ? "bg-indigo-500/20 text-indigo-800 dark:text-indigo-200"
                      : "bg-amber-500/20 text-amber-800 dark:text-amber-300"
                  }`}
                >
                  {mascotMoodForModal === "sleep" ? "🌙 Nhắc nhở" : "Lời khuyên"}
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-snug">
                {mascotTip}
              </p>
            </div>
          </div>
        </div>

        {/* MODAL ACTIONS FOOTER */}
        <div className="p-3 sm:px-4 sm:py-3 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-300 shrink-0">
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-500 dark:text-slate-400 shrink-0 whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="text-[10px] sm:text-[11px] font-medium shrink-0 whitespace-nowrap">
              Tự nạp ảnh mỗi {refreshInterval}s
            </span>
          </div>

          <div className="grid grid-cols-3 sm:flex items-center gap-1.5 sm:gap-2 flex-nowrap">
            <button
              onClick={handleCopyLink}
              title="Sao chép link chia sẻ camera này"
              className="flex items-center justify-center gap-1 px-2.5 py-2 sm:py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 border border-slate-200 dark:border-slate-700 shadow-2xs text-[11px] sm:text-xs cursor-pointer shrink-0 whitespace-nowrap"
            >
              {copiedLink ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Copy className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="shrink-0 whitespace-nowrap">{copiedLink ? "Đã chép" : "Sao chép"}</span>
            </button>

            <button
              onClick={handleManualRefresh}
              className="flex items-center justify-center gap-1 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-md shadow-blue-600/20 active:scale-95 text-[11px] sm:text-xs cursor-pointer shrink-0 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 shrink-0 ${stream.isFetching ? "animate-spin" : ""}`}
              />
              <span className="shrink-0 whitespace-nowrap">Làm mới</span>
            </button>

            <a
              href={`/camera/${camera.CamId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition border border-slate-200 dark:border-slate-700 shadow-2xs text-[11px] sm:text-xs cursor-pointer shrink-0 whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              <span className="shrink-0 whitespace-nowrap">Trang riêng</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
