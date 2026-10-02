"use client";

import React from "react";
import { CameraItem } from "@/types/camera";
import { useCameraStream } from "@/context/CameraContext";
import { Video, MapPin, RefreshCw, AlertCircle } from "lucide-react";

interface CameraCardProps {
  camera: CameraItem;
  onSelect?: (camera: CameraItem) => void;
}

export default function CameraCard({ camera, onSelect }: CameraCardProps) {
  // Consume stream state directly from Context - NO fetch or timer logic inside component
  const { stream, refreshInterval } = useCameraStream(camera.CamId);

  const {
    currentImgSrc,
    isInitialLoading,
    isFetching,
    hasError,
    timeLeft,
    isCountingDown,
  } = stream;

  // Calculate SVG countdown stroke
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    refreshInterval > 0 && isCountingDown
      ? circumference - ((refreshInterval - timeLeft) / refreshInterval) * circumference
      : isFetching
      ? circumference
      : 0;

  return (
    <div
      onClick={() => onSelect && onSelect(camera)}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col cursor-pointer"
    >
      {/* Media Container */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Skeleton placeholder on initial page load only */}
        {isInitialLoading && !hasError && (
          <div className="absolute inset-0 bg-slate-800 animate-pulse flex flex-col items-center justify-center text-slate-500 gap-2 z-10">
            <Video className="w-8 h-8 opacity-40 animate-bounce" />
            <span className="text-xs">Đang nạp luồng camera...</span>
          </div>
        )}

        {/* Live Image (Displays current image while context pre-fetches next image in background) */}
        {currentImgSrc && (
          <img
            src={currentImgSrc}
            alt={camera.CamName}
            className="w-full h-full object-cover transition-opacity duration-300"
            loading="lazy"
          />
        )}

        {/* Error State when completely unable to fetch */}
        {hasError && !currentImgSrc && (
          <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-slate-400 p-4 text-center z-10">
            <AlertCircle className="w-6 h-6 text-amber-500 mb-1" />
            <span className="text-xs font-medium text-slate-200">Mất tín hiệu camera</span>
            <span className="text-[10px] text-slate-500">Tự động kết nối lại sau giây lát</span>
          </div>
        )}

        {/* Live Badge & Fetching Status managed by Context */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-[10px] font-medium text-white z-20">
          {isFetching ? (
            <>
              <RefreshCw className="w-2.5 h-2.5 text-blue-400 animate-spin" />
              <span className="text-blue-300 font-mono">LOADING</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="w-2 h-2 rounded-full bg-emerald-500 -ml-2.5" />
              <span>LIVE</span>
            </>
          )}
        </div>

        {/* Circular Countdown Timer */}
        {refreshInterval > 0 && (
          <div className="absolute top-2 right-2 flex items-center justify-center bg-black/60 backdrop-blur-md rounded-full w-7 h-7 z-20">
            <svg className="w-6 h-6 transform -rotate-90">
              <circle
                cx="12"
                cy="12"
                r={radius}
                className="stroke-slate-700"
                strokeWidth="2.5"
                fill="none"
              />
              <circle
                cx="12"
                cy="12"
                r={radius}
                className={`transition-all duration-1000 ease-linear ${
                  isFetching ? "stroke-blue-400" : "stroke-emerald-400"
                }`}
                strokeWidth="2.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <span
              suppressHydrationWarning
              className="absolute text-[9px] font-semibold text-white"
            >
              {isFetching ? (
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
              ) : (
                `${timeLeft}s`
              )}
            </span>
          </div>
        )}
      </div>

      {/* Camera Info */}
      <div className="p-3 flex flex-col justify-between flex-1 gap-1">
        <h3
          className="font-medium text-xs sm:text-sm text-slate-800 dark:text-slate-100 line-clamp-2"
          title={camera.CamName}
        >
          {camera.CamName}
        </h3>
        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate max-w-[130px]">{camera.District || "TP.HCM"}</span>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-600 dark:text-slate-400">
            ID: {camera.CamId.slice(-6)}
          </span>
        </div>
      </div>
    </div>
  );
}
