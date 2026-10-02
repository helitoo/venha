"use client";

import React, { useEffect } from "react";
import { CameraItem } from "@/types/camera";
import { useCameraContext, useCameraStream } from "@/context/CameraContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
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

  const weather = getWeatherInfo(camera.CamId);
  const flood = getFloodInfo(camera.CamId);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex flex-col">
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              {camera.CamName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                {camera.District || "TP.HCM"}
              </span>
              <span>•</span>
              <span className="font-mono text-[11px] text-slate-500">ID: {camera.CamId}</span>

              {weather && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-cyan-400 font-medium">
                    {weather.category === "tornado" ? (
                      <Tornado className="w-3.5 h-3.5" />
                    ) : weather.category === "cloud-rain" ? (
                      <CloudRain className="w-3.5 h-3.5" />
                    ) : weather.category === "droplet" ? (
                      <Droplet className="w-3.5 h-3.5" />
                    ) : (
                      <Leaf className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>WMO: {weather.weatherCode}</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body - Stream Display */}
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {stream.isInitialLoading && !stream.currentImgSrc && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-xs">Đang nạp luồng camera chất lượng cao...</span>
            </div>
          )}

          {stream.currentImgSrc && (
            <img
              src={stream.currentImgSrc}
              alt={camera.CamName}
              className="w-full h-full object-contain transition-opacity duration-200"
            />
          )}

          {stream.isFetching && (
            <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-xs text-blue-400 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              <span>Đang tải ảnh mới...</span>
            </div>
          )}
        </div>

        {/* Gemini AI Flood Assessment Banner */}
        {flood && (
          <div
            className={`px-4 py-2.5 border-t border-b flex items-center justify-between gap-3 text-xs ${
              flood.floodLevel === "LEVEL_3"
                ? "bg-rose-500/20 border-rose-500/30 text-rose-300"
                : flood.floodLevel === "LEVEL_2"
                ? "bg-orange-600/20 border-orange-600/30 text-orange-300"
                : flood.floodLevel === "LEVEL_1"
                ? "bg-amber-500/20 border-amber-500/30 text-amber-300"
                : "bg-emerald-500/20 border-emerald-500/30 text-emerald-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span className="font-bold">
                {flood.floodLevel === "LEVEL_3"
                  ? "🔴 Level 3: Ngập nặng (> 40cm)"
                  : flood.floodLevel === "LEVEL_2"
                  ? "🟠 Level 2: Ngập vừa (15 - 40cm)"
                  : flood.floodLevel === "LEVEL_1"
                  ? "🟡 Level 1: Ngập nhẹ (< 15cm)"
                  : "🟢 Level 0: Tuyến đường không ngập"}
              </span>
            </div>
            {flood.description && (
              <span className="text-[11px] opacity-80 line-clamp-1">{flood.description}</span>
            )}
          </div>
        )}

        {/* Modal Controls Footer */}
        <div className="p-3 sm:p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-medium">Tự động cập nhật hình ảnh theo chu kỳ</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-lg shadow-blue-600/20 active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Làm mới ngay
            </button>
            <a
              href={`/camera/${camera.CamId}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Mở trang riêng
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
