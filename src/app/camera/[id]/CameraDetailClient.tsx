"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { CameraItem } from "@/types/camera";
import { ArrowLeft, MapPin, Video, Info, Sun, Moon, RefreshCw, Sparkles, Map } from "lucide-react";
import CameraCard from "@/components/CameraCard";
import { useCameraStream } from "@/context/CameraContext";

interface CameraDetailClientProps {
  camera: CameraItem;
  relatedCameras: CameraItem[];
}

export default function CameraDetailClient({
  camera,
  relatedCameras,
}: CameraDetailClientProps) {
  const [isDark, setIsDark] = useState(true);
  const [refreshKey, setRefreshKey] = useState(Date.now());
  const { stream, refresh } = useCameraStream(camera.CamId);

  // Initialize theme from html class or localStorage
  useEffect(() => {
    const isDocDark = document.documentElement.classList.contains("dark");
    setIsDark(isDocDark);
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    if (nextDark) {
      document.documentElement.classList.add("dark");
      try {
        localStorage.setItem("venha_theme", "dark");
      } catch {}
    } else {
      document.documentElement.classList.remove("dark");
      try {
        localStorage.setItem("venha_theme", "light");
      } catch {}
    }
  };

  const handleManualRefresh = () => {
    setRefreshKey(Date.now());
    refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200 p-4 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Top Bar Navigation & Utilities */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm font-semibold text-slate-700 hover:text-blue-600 dark:text-slate-300 dark:hover:text-blue-400 shadow-xs transition active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Quay lại bản đồ</span>
          </Link>

          <div className="flex items-center gap-2">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              title={isDark ? "Chuyển sang chế độ Sáng (Light Mode)" : "Chuyển sang chế độ Tối (Dark Mode)"}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
            >
              {isDark ? (
                <>
                  <Sun className="w-4 h-4 text-amber-500" />
                  <span className="hidden sm:inline">Chế độ Sáng</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-indigo-500" />
                  <span className="hidden sm:inline">Chế độ Tối</span>
                </>
              )}
            </button>

            {/* Camera ID Badge */}
            <span className="text-xs bg-slate-200/80 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl border border-slate-300/60 dark:border-slate-800 font-mono shadow-xs">
              ID: {camera.CamId}
            </span>
          </div>
        </div>

        {/* Main Camera Live Card */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xl transition-all">
          {/* Card Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span>{camera.CamName}</span>
              </h1>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
                <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span>{camera.District || "TP. Hồ Chí Minh"}</span>
              </div>
            </div>

            {/* Refresh stream button */}
            <button
              onClick={handleManualRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-600 dark:text-blue-400 text-xs font-bold transition active:scale-95 border border-blue-200/80 dark:border-blue-900/50 cursor-pointer shadow-xs"
              title="Làm mới luồng hình ảnh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${stream.isFetching ? "animate-spin" : ""}`} />
              <span>Nạp lại ảnh</span>
            </button>
          </div>

          {/* Big Live Stream Canvas */}
          <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
            {stream.isFetching && (
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs text-cyan-400 flex items-center gap-1.5 font-medium z-10">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Đang tải lại...</span>
              </div>
            )}

            <img
              src={`/api/proxy?id=${encodeURIComponent(camera.CamId)}&t=${refreshKey}`}
              alt={camera.CamName}
              onError={(e) => {
                const target = e.currentTarget;
                target.style.display = "none";
                const errBox = target.nextElementSibling as HTMLElement;
                if (errBox) errBox.style.display = "flex";
              }}
              className="w-full h-full object-contain"
            />

            <div style={{ display: "none" }} className="absolute inset-0 flex-col items-center justify-center text-center p-6 bg-slate-900 text-slate-400 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <strong className="block text-sm font-bold text-slate-200">Không thể tải luồng hình ảnh</strong>
                <span className="text-xs text-slate-400 mt-1 block">Tín hiệu camera đang tạm ngắt hoặc đường truyền bận</span>
              </div>
              <button
                onClick={handleManualRefresh}
                className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition active:scale-95 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tải lại ảnh</span>
              </button>
            </div>
          </div>

          {/* Card Footer */}
          <div className="p-4 bg-slate-50/90 dark:bg-slate-950/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Dữ liệu luồng trực tiếp từ Trung tâm Quản lý Giao thông đô thị TP.HCM</span>
            </div>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-semibold"
            >
              <Map className="w-3.5 h-3.5" />
              <span>Xem trên bản đồ</span>
            </Link>
          </div>
        </div>

        {/* Related Cameras in District */}
        {relatedCameras.length > 0 && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Camera khác tại khu vực {camera.District || "lân cận"}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {relatedCameras.map((relCam) => (
                <CameraCard key={relCam.CamId} camera={relCam} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
