import React from "react";
import Link from "next/link";
import { getAllCameras } from "@/lib/cameras";
import { AlertTriangle, Home, Video, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const cameras = getAllCameras();
  const fallbackCameras = cameras.slice(0, 8); // Hiển thị 8 camera nổi bật làm fallback

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-8">
      {/* 404 Header / Alert */}
      <div className="max-w-6xl mx-auto w-full mb-8 text-center pt-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500 mb-4 border border-amber-500/20">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-2">
          404 - Không tìm thấy trang
        </h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto mb-6">
          Đường dẫn bạn yêu cầu không tồn tại hoặc camera đã được di dời. Bạn có thể quay về trang chủ hoặc xem danh sách camera khả dụng dưới đây:
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/30 transition"
        >
          <Home className="w-4 h-4" />
          <span>Về trang chủ Camera</span>
        </Link>
      </div>

      {/* Fallback Camera List */}
      <div className="max-w-6xl mx-auto w-full flex-1">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-6">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-slate-200">
              Danh sách Camera gợi ý (Fallback List)
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Hiển thị {fallbackCameras.length} / {cameras.length} camera
          </span>
        </div>

        {/* Fallback Camera Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {fallbackCameras.map((cam) => (
            <div
              key={cam.CamId}
              className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition flex flex-col"
            >
              <div className="relative aspect-video bg-black flex items-center justify-center">
                <img
                  src={`/api/proxy?id=${encodeURIComponent(cam.CamId)}`}
                  alt={cam.CamName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-md px-1.5 py-0.5 rounded text-[10px] text-emerald-400 font-medium">
                  {cam.District || "TP.HCM"}
                </div>
              </div>

              <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                <h3 className="text-xs font-semibold text-slate-200 line-clamp-2">
                  {cam.CamName}
                </h3>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                  <span className="font-mono text-[10px] text-slate-500">
                    ID: {cam.CamId.slice(-6)}
                  </span>
                  <Link
                    href={`/camera/${cam.CamId}`}
                    className="text-blue-400 hover:text-blue-300 font-medium hover:underline text-[11px]"
                  >
                    Xem chi tiết →
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Back Button */}
        <div className="mt-8 text-center pb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Xem tất cả {cameras.length} camera tại trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
