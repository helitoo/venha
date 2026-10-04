"use client";

import React from "react";
import { CameraItem } from "@/types/camera";
import { useCameraStream } from "@/context/CameraContext";
import { Video, MapPin, RefreshCw, AlertCircle, ExternalLink } from "lucide-react";
import { getOfficialCameraPlayerUrl } from "@/lib/cameras";

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

  return (
    <div
      onClick={() => onSelect && onSelect(camera)}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col cursor-pointer"
    >
      {/* Media & Official Link Container */}
      <div className="relative aspect-video w-full bg-slate-50 dark:bg-slate-950/70 flex flex-col items-center justify-center p-3 text-center overflow-hidden border-b border-slate-100 dark:border-slate-800/80">
        {/* Stylized Camera Icon */}
        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 dark:bg-blue-500/15 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-1.5 shadow-2xs group-hover:scale-105 transition-transform">
          <Video className="w-5 h-5" />
        </div>
        
        <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
          {camera.CamName}
        </span>
        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1 mt-0.5">
          <span>Xem camera trực tiếp</span>
          <ExternalLink className="w-3 h-3" />
        </span>

        {/* Live Status Badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white/90 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 px-2 py-0.5 rounded-full text-[9px] font-medium text-slate-700 dark:text-slate-300 z-10 shrink-0 whitespace-nowrap shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <span>Sở GTVT</span>
        </div>

        {/* NOTE: Direct snapshot proxy image display commented out below for full legal compliance & copyright safety */}
        {/*
        {currentImgSrc && (
          <img
            src={currentImgSrc}
            alt={camera.CamName}
            className="w-full h-full object-cover transition-opacity duration-300"
            loading="lazy"
          />
        )}
        */}
      </div>

      {/* Camera Info */}
      <div className="p-3 flex flex-col justify-between flex-1 gap-1">
        <h3
          className="font-medium text-xs sm:text-sm text-slate-800 dark:text-slate-100 line-clamp-2"
          title={camera.CamName}
        >
          {camera.CamName}
        </h3>
        <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500 dark:text-slate-400 gap-1.5 flex-nowrap">
          <div className="flex items-center gap-1 min-w-0">
            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
            <span className="truncate max-w-[130px]">{camera.District || "TP.HCM"}</span>
          </div>
          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono text-slate-600 dark:text-slate-400 shrink-0 whitespace-nowrap">
            ID: {camera.CamId.slice(-6)}
          </span>
        </div>
      </div>
    </div>
  );
}
