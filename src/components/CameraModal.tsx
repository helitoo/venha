"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import { CameraItem, CameraFloodAnalysis } from "@/types/camera";
import { useCameraContext, useCameraStream } from "@/context/CameraContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import { useMascotContext } from "@/context/MascotContext";
import { getGoogleTrafficMeta, getCameraTrafficDensity } from "@/lib/google-traffic";
import {
  X,
  MapPin,
  RefreshCw,
  ExternalLink,
  Droplet,
  CloudRain,
  Tornado,
  Leaf,
  ShieldAlert,
  Sparkles,
  Bot,
  Copy,
  Check,
  Clock,
  Compass,
  Zap,
  CheckCircle2,
  Car,
  Activity,
  Gauge,
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
const CLIENT_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
  setRefreshInterval,
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

  // Auto-scan on camera open if no fresh scan exists (within 10 minutes)
  const hasAutoScannedRef = React.useRef(false);
  useEffect(() => {
    if (hasAutoScannedRef.current) return;
    const now = Date.now();
    const isStaleOrMissing =
      !effectiveFlood ||
      !effectiveFlood.analyzedAt ||
      now - effectiveFlood.analyzedAt > 10 * 60 * 1000;

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
    if (trafficDensity === "jam") {
      return `${name}: "Khu vực này đang ùn tắc, kẹt xe khá nghiêm trọng! Bạn nên chọn đường khác đi vòng nha!"`;
    }
    if (trafficDensity === "high") {
      return `${name}: "Đoạn đường này xe cộ đang khá đông đúc và di chuyển chậm, bạn nhớ giữ đều ga và quan sát kỹ nhé!"`;
    }
    if (trafficDensity === "low") {
      return `${name}: "Đoạn đường này đang rất thông thoáng, xe cộ vắng vẻ chạy bon bon meow!"`;
    }
    return `${name}: "Mặt đường thông thoáng và khô ráo! Lộ trình an toàn để di chuyển rồi đấy!"`;
  }, [effectiveFlood, mascotType, trafficDensity]);

  const mascotAvatar = getMascotImage(
    effectiveFlood?.floodLevel === "LEVEL_3" || effectiveFlood?.floodLevel === "LEVEL_2"
      ? "flood"
      : effectiveFlood?.isRaining
      ? "rain"
      : "sunny"
  );

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn select-none">
      {/* Backdrop click to close */}
      <div className="fixed inset-0 -z-10" onClick={onClose} />

      {/* Main Modal Card (Light & Dark Theme adaptive) */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-cyan-500/40 w-full max-w-4xl rounded-2xl overflow-hidden shadow-2xl flex flex-col my-auto transition-all max-h-[92vh]">
        {/* 1. MODAL HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70">
          <div className="flex flex-col min-w-0 pr-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 truncate">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="truncate">{camera.CamName}</span>
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1 flex-wrap">
              <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                {camera.District || camera.Disctrict || "TP.HCM"}
              </span>
              <span>•</span>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">ID: {camera.CamId}</span>

              {weather && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400 font-medium">
                    {weather.category === "tornado" ? (
                      <Tornado className="w-3.5 h-3.5 text-purple-500" />
                    ) : weather.category === "cloud-rain" ? (
                      <CloudRain className="w-3.5 h-3.5 text-cyan-500" />
                    ) : weather.category === "droplet" ? (
                      <Droplet className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <Leaf className="w-3.5 h-3.5 text-emerald-500" />
                    )}
                    <span>WMO: {weather.weatherCode}</span>
                  </span>
                </>
              )}

              {currentTimeStr && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    <Clock className="w-3 h-3 text-slate-400 dark:text-slate-500" />
                    {currentTimeStr}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onClose}
              title="Đóng cửa sổ (phím Esc)"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition active:scale-95 border border-slate-200 dark:border-slate-700/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. SCROLLABLE CONTENT BODY */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
          {/* A. SNAPSHOT STREAM VIEWPORT */}
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-inner group">
            {stream.isInitialLoading && !stream.currentImgSrc && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <span className="text-xs font-medium">Đang tải luồng camera trực tiếp...</span>
              </div>
            )}

            {stream.currentImgSrc && (
              <img
                src={stream.currentImgSrc}
                alt={camera.CamName}
                className="w-full h-full object-contain transition-opacity duration-200"
              />
            )}

            {/* Top-left LIVE Badge */}
            <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
              <span className="px-2.5 py-1 rounded-full bg-red-600/90 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-lg backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                TRỰC TIẾP
              </span>
              <span className="px-2.5 py-1 rounded-full bg-slate-900/80 text-slate-200 text-[11px] font-medium backdrop-blur-md hidden sm:inline-block">
                {camera.District || "TP.HCM"}
              </span>
            </div>

            {/* Top-right In-Viewport Refresh Button */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              {stream.isFetching && (
                <div className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] text-cyan-400 flex items-center gap-1.5 font-medium">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  <span>Đang cập nhật...</span>
                </div>
              )}
              <button
                onClick={refresh}
                title="Làm mới ảnh ngay"
                className="p-2 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-md text-slate-200 hover:text-white transition active:scale-90 border border-white/10"
              >
                <RefreshCw className={`w-4 h-4 ${stream.isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* B. PROMINENT ROAD ANALYSIS PANEL (Neutral branding) */}
          <div className="relative rounded-2xl p-4 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 dark:from-slate-950 dark:via-slate-900 dark:to-blue-950/60 border border-slate-200 dark:border-cyan-500/30 shadow-lg">
            {/* Panel Header */}
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-800/80 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400">
                  <Sparkles className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    Đánh giá mặt đường & ngập úng
                    <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold">
                      Thời gian thực
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Tự động nhận diện nước ngập & dấu hiệu trời mưa trên mặt đường
                  </p>
                </div>
              </div>

              {/* On-Demand Scan Button */}
              <button
                onClick={handleTriggerAI}
                disabled={isAnalyzingAI}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold transition shadow-md shadow-cyan-600/20 flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
              >
                {isAnalyzingAI ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang phân tích ảnh...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>Quét ảnh ngay</span>
                  </>
                )}
              </button>
            </div>

            {/* Diagnostic Metrics Grid (4 Columns: Rain, Flood, Road Surface, Traffic Density) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mb-3">
              {/* Metric 1: Rain Tracking (Theo dõi Mưa) */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                  Nhận diện Trời Mưa
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      effectiveFlood?.isRaining ? "bg-cyan-500 animate-ping" : "bg-slate-400"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {effectiveFlood?.isRaining ? "🌧️ Đang có mưa" : "☀️ Không mưa"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 capitalize">
                  {effectiveFlood?.rainIntensity === "heavy"
                    ? "Mưa to / giông bão"
                    : effectiveFlood?.rainIntensity === "moderate"
                    ? "Mưa rào vừa"
                    : effectiveFlood?.rainIntensity === "light"
                    ? "Mưa phùn / hạt nhỏ"
                    : "Thời tiết khô ráo"}
                </span>
              </div>

              {/* Metric 2: Flood Level (Cấp độ Ngập) */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                  Mức độ Ngập lụt
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      effectiveFlood?.floodLevel === "LEVEL_3"
                        ? "bg-rose-500 animate-pulse"
                        : effectiveFlood?.floodLevel === "LEVEL_2"
                        ? "bg-orange-500"
                        : effectiveFlood?.floodLevel === "LEVEL_1"
                        ? "bg-amber-400"
                        : "bg-emerald-500"
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {effectiveFlood?.floodLevel === "LEVEL_3"
                      ? "Level 3: Ngập nặng"
                      : effectiveFlood?.floodLevel === "LEVEL_2"
                      ? "Level 2: Ngập vừa"
                      : effectiveFlood?.floodLevel === "LEVEL_1"
                      ? "Level 1: Ngập nhẹ"
                      : "Level 0: Không ngập"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {effectiveFlood?.floodLevel === "LEVEL_0"
                    ? "Giao thông an toàn"
                    : "Chú ý gầm thấp"}
                </span>
              </div>

              {/* Metric 3: Road Condition (Mặt đường) */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Tình trạng mặt đường
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {effectiveFlood?.roadCondition === "flooded"
                      ? "🌊 Bị ngập nước"
                      : effectiveFlood?.roadCondition === "wet"
                      ? "💧 Ẩm ướt / Trơn trượt"
                      : "✨ Khô ráo, sạch sẽ"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                  {effectiveFlood?.analyzedAt
                    ? `Cập nhật: ${new Date(effectiveFlood.analyzedAt).toLocaleTimeString("vi-VN")}`
                    : "Vừa cập nhật"}
                </span>
              </div>

              {/* Metric 4: Traffic Density (Mật độ xe) */}
              <div className="bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between shadow-sm">
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Car className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    Mật độ xe
                  </span>
                  <span className="text-[9px] font-mono text-slate-400">
                    {trafficMeta.speedEstimate}
                  </span>
                </span>

                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className={`w-2.5 h-2.5 rounded-full ${trafficMeta.dotColor}`} />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                    {trafficMeta.label}
                  </span>
                </div>

                {/* Density Bar */}
                <div className="mt-1.5 space-y-1">
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${trafficMeta.barColor} ${trafficMeta.barPercent}`}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                    {trafficMeta.speedLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Diagnosis Quote Box */}
            <div className="bg-slate-100 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-3 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-cyan-600 dark:text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                  {effectiveFlood?.description || "Tuyến đường thông thoáng, không phát hiện ngập úng."}
                </p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>Hệ thống: Giám sát camera giao thông thời gian thực</span>
                  <span>•</span>
                  <span>Đo lưu lượng: Thời gian thực</span>
                </div>
              </div>
            </div>

            {/* Traffic Flow & Density Breakdown Banner */}
            <div className="mt-2.5 p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300">
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    Lưu lượng xe:
                  </span>{" "}
                  <span className={`px-2 py-0.5 rounded-md font-bold ${trafficMeta.pillClass}`}>
                    {trafficMeta.label}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 ml-1">
                    (~{trafficMeta.speedEstimate})
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* C. MASCOT COMMENTARY CARD */}
          <div className="bg-amber-50/70 dark:bg-slate-900/60 border border-amber-200/70 dark:border-slate-800 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
            <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-500/20 p-1 shrink-0 flex items-center justify-center shadow-sm">
              <img src={mascotAvatar} alt="Mascot" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1">
              <div className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <span>{mascotType === "duck" ? "🦆 Bé Vịt" : "🐱 Bé Mèo"} nhắc nhở</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-300">
                  Lời khuyên
                </span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5 leading-snug">{mascotTip}</p>
            </div>
          </div>
        </div>

        {/* 3. MODAL ACTIONS FOOTER */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium">Tự động nạp ảnh mới mỗi {refreshInterval}s</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              title="Sao chép link chia sẻ camera này"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold transition active:scale-95 border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? "Đã chép link" : "Sao chép"}</span>
            </button>

            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-md shadow-blue-600/20 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Làm mới ảnh</span>
            </button>

            <a
              href={`/camera/${camera.CamId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition border border-slate-200 dark:border-slate-700 shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Mở trang riêng</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
