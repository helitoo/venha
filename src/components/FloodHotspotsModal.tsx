"use client";

import React, { useState, useMemo } from "react";
import {
  FREQUENT_FLOOD_HOTSPOTS,
  FloodHotspot,
} from "@/data/floodHotspots";
import { CameraItem } from "@/types/camera";
import {
  Waves,
  CloudRain,
  ShieldAlert,
  Search,
  X,
  MapPin,
  Eye,
  AlertTriangle,
  Info,
} from "lucide-react";

interface FloodHotspotsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCameras: CameraItem[];
  onFlyToCamera: (cam: CameraItem) => void;
}

export default function FloodHotspotsModal({
  isOpen,
  onClose,
  allCameras,
  onFlyToCamera,
}: FloodHotspotsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCause, setFilterCause] = useState<"all" | "tide" | "rain" | "both">("all");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");

  const districts = useMemo(() => {
    const set = new Set<string>();
    FREQUENT_FLOOD_HOTSPOTS.forEach((h) => set.add(h.district));
    return ["all", ...Array.from(set)];
  }, []);

  const filteredHotspots = useMemo(() => {
    return FREQUENT_FLOOD_HOTSPOTS.filter((h) => {
      // Cause filter
      if (filterCause !== "all") {
        if (filterCause === "both" && h.cause !== "both") return false;
        if (filterCause === "tide" && h.cause !== "tide" && h.cause !== "both") return false;
        if (filterCause === "rain" && h.cause !== "rain" && h.cause !== "both") return false;
      }
      // District filter
      if (selectedDistrict !== "all" && h.district !== selectedDistrict) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const streetNorm = h.street.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const distNorm = h.district.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const descNorm = h.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return streetNorm.includes(q) || distNorm.includes(q) || descNorm.includes(q);
      }
      return true;
    });
  }, [filterCause, selectedDistrict, searchQuery]);

  // Find camera matching this hotspot
  const findCameraForHotspot = (hotspot: FloodHotspot): CameraItem | undefined => {
    return allCameras.find((cam) => {
      const name = (cam.CamName || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return hotspot.keywords.some((kw) => {
        const kwNorm = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return name.includes(kwNorm);
      });
    });
  };

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 font-sans cursor-pointer"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-slate-900 dark:to-slate-850">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 text-white flex items-center justify-center shadow-lg shadow-cyan-500/20 shrink-0">
              <Waves className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Tuyến Đường Hay Ngập Nước TP.HCM
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 text-xs font-semibold border border-cyan-500/20">
                  {FREQUENT_FLOOD_HOTSPOTS.length} Điểm nóng
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Các điểm trũng thấp thường xuyên ngập do Thủy triều sông Sài Gòn & Mưa lớn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-900/50">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên đường (Trần Xuân Soạn, Huỳnh Tấn Phát, Quốc Hương...)..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Cause Badges & District Selector */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none pb-0.5 max-w-full">
              <button
                onClick={() => setFilterCause("all")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition shrink-0 whitespace-nowrap cursor-pointer ${
                  filterCause === "all"
                    ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                Tất cả ({FREQUENT_FLOOD_HOTSPOTS.length})
              </button>
              <button
                onClick={() => setFilterCause("tide")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  filterCause === "tide"
                    ? "bg-cyan-600 text-white shadow-sm"
                    : "bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-50 dark:hover:bg-slate-800"
                }`}
              >
                <Waves className="w-3 h-3 shrink-0" /> <span className="shrink-0 whitespace-nowrap">Triều cường</span>
              </button>
              <button
                onClick={() => setFilterCause("rain")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  filterCause === "rain"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-slate-800"
                }`}
              >
                <CloudRain className="w-3 h-3 shrink-0" /> <span className="shrink-0 whitespace-nowrap">Mưa lớn</span>
              </button>
              <button
                onClick={() => setFilterCause("both")}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition shrink-0 whitespace-nowrap cursor-pointer ${
                  filterCause === "both"
                    ? "bg-orange-600 text-white shadow-sm"
                    : "bg-white dark:bg-slate-800 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-slate-800"
                }`}
              >
                <AlertTriangle className="w-3 h-3 shrink-0" /> <span className="shrink-0 whitespace-nowrap">Cả hai</span>
              </button>
            </div>

            {/* District Filter Dropdown */}
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none shrink-0"
            >
              <option value="all">Tất cả quận/huyện</option>
              {districts.filter((d) => d !== "all").map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Hotspots List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[55vh]">
          {filteredHotspots.length === 0 ? (
            <div className="text-center py-10 text-slate-400 space-y-2">
              <Info className="w-8 h-8 mx-auto opacity-50" />
              <p className="text-xs font-medium">Không tìm thấy tuyến đường phù hợp với bộ lọc.</p>
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilterCause("all");
                  setSelectedDistrict("all");
                }}
                className="px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-slate-200 cursor-pointer"
              >
                Xóa bộ lọc tìm kiếm
              </button>
            </div>
          ) : (
            filteredHotspots.map((item) => {
              const matchedCam = findCameraForHotspot(item);

              return (
                <div
                  key={item.id}
                  className="pt-2.5 first:pt-0 flex items-start justify-between gap-3 group hover:bg-slate-50/80 dark:hover:bg-slate-800/40 p-2.5 rounded-2xl transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto scrollbar-none">
                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition truncate">
                        {item.street}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium shrink-0 whitespace-nowrap">
                        {item.district}
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border shrink-0 whitespace-nowrap ${
                          item.cause === "tide"
                            ? "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"
                            : item.cause === "rain"
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                            : "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800"
                        }`}
                      >
                        {item.causeLabel}
                      </span>
                      {item.severity === "Cao" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 font-bold shrink-0 whitespace-nowrap">
                          Ngập sâu
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  {/* Action: View camera */}
                  <div className="shrink-0 self-center">
                    {matchedCam ? (
                      <button
                        onClick={() => {
                          onFlyToCamera(matchedCam);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-95 transition"
                        title={`Xem camera ${matchedCam.CamName}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem Camera</span>
                      </button>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic">Chưa có camera</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Note */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-[11px] text-slate-500 flex items-center justify-between">
          <span>💡 Hệ thống tự động kiểm tra camera tại các điểm này liên tục để phát hiện ngập sớm.</span>
          <span className="font-mono text-[10px]">Cập nhật 2026</span>
        </div>
      </div>
    </div>
  );
}
