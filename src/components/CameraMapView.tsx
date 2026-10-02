"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCameraContext, useCameraStream } from "@/context/CameraContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import { CameraItem, FloodLevel, WeatherCategory } from "@/types/camera";
import {
  Maximize2,
  Video,
  Search,
  RefreshCw,
  Eye,
  Crosshair,
  MapPin,
  Filter,
  Sun,
  Moon,
  Droplet,
  CloudRain,
  Tornado,
  Leaf,
  ShieldAlert,
  Waves,
  Sparkles,
  Info,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import type * as LeafletType from "leaflet";

interface CameraMapViewProps {
  onSelectCamera?: (cam: CameraItem) => void;
}

// Map WMO category to raw SVG string for Leaflet HTML Markers
function getWeatherSvgHtml(category: WeatherCategory): string {
  switch (category) {
    case "droplet":
      return `<svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>`;
    case "cloud-rain":
      return `<svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`;
    case "tornado":
      return `<svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 4H3"/><path d="M18 8H6"/><path d="M19 12H9"/><path d="M16 16h-6"/><path d="M11 20H9"/></svg>`;
    case "leaf":
    default:
      return `<svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`;
  }
}

// React component helper for Weather icon
function WeatherIconComponent({
  category,
  className = "w-4 h-4",
}: {
  category?: WeatherCategory;
  className?: string;
}) {
  switch (category) {
    case "droplet":
      return <Droplet className={className} />;
    case "cloud-rain":
      return <CloudRain className={className} />;
    case "tornado":
      return <Tornado className={className} />;
    case "leaf":
    default:
      return <Leaf className={className} />;
  }
}

export default function CameraMapView({ onSelectCamera }: CameraMapViewProps) {
  const {
    filteredCameras,
    allCameras,
    districts,
    selectedDistrict,
    setSelectedDistrict,
    searchQuery,
    setSearchQuery,
    isDarkMode,
    toggleTheme,
    refreshAll,
    setSelectedCamera,
    refreshInterval,
    cameraCountdown,
    setRefreshInterval,
    streams,
    getStreamState,
    registerActiveCamera,
    unregisterActiveCamera,
    updateActiveViewportCameras,
  } = useCameraContext();

  const {
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
  } = useWeatherFloodContext();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletType.Map | null>(null);
  const markersLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string, LeafletType.Marker>>(new Map());
  const tileLayerRef = useRef<LeafletType.TileLayer | null>(null);

  const [activePopupCam, setActivePopupCam] = useState<CameraItem | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [activeTabLayer, setActiveTabLayer] = useState<"standard" | "satellite">("standard");
  const [visibleCount, setVisibleCount] = useState(0);

  // Filter cameras that have valid Lat & Lng
  const mapCameras = useMemo(() => {
    return filteredCameras.filter(
      (c) => typeof c.Lat === "number" && typeof c.Lng === "number" && !isNaN(c.Lat) && !isNaN(c.Lng)
    );
  }, [filteredCameras]);

  // Keep a ref of mapCameras to avoid re-binding map event listeners constantly
  const mapCamerasRef = useRef<CameraItem[]>(mapCameras);
  mapCamerasRef.current = mapCameras;

  // Viewport Culling & Custom Node Rendering without DOM recreating / jittering
  const updateVisibleMarkers = useCallback(
    async (fitToFiltered = false) => {
      if (!mapInstanceRef.current || !markersLayerRef.current) return;

      const L = (await import("leaflet")).default;
      const map = mapInstanceRef.current;
      const markersLayer = markersLayerRef.current;
      const currentMarkers = markersMapRef.current;

      const currentCameras = mapCamerasRef.current;
      if (!currentCameras || currentCameras.length === 0) {
        currentMarkers.forEach((marker) => markersLayer.removeLayer(marker));
        currentMarkers.clear();
        setVisibleCount(0);
        return;
      }

      // If user just changed filter/search and requested fit
      if (fitToFiltered) {
        const allBounds = currentCameras.map((c) => [c.Lat!, c.Lng!] as [number, number]);
        map.fitBounds(allBounds, { padding: [80, 80], maxZoom: 16 });
      }

      // Viewport bounds with 15% buffer padding for smooth pan
      const viewBounds = map.getBounds().pad(0.15);

      // Only render cameras within current viewport
      const visibleCams = currentCameras.filter((cam) =>
        viewBounds.contains([cam.Lat!, cam.Lng!])
      );

      setVisibleCount(visibleCams.length);

      // Register all visible cameras in viewport for automatic image fetching & interval countdown
      const visibleCamIds = visibleCams.map((c) => c.CamId);
      updateActiveViewportCameras(visibleCamIds);

      const visibleCamMap = new Map(visibleCams.map((c) => [c.CamId, c]));

      // 1. Remove markers no longer in viewport
      currentMarkers.forEach((marker, camId) => {
        if (!visibleCamMap.has(camId)) {
          markersLayer.removeLayer(marker);
          currentMarkers.delete(camId);
        }
      });

      // 2. Add or update markers in viewport (smooth update, only replace DOM icon if visual changed)
      visibleCams.forEach((cam) => {
        const visual = getMarkerVisualState(cam);
        const weatherSvg = getWeatherSvgHtml(visual.weatherCategory);

        const visualKey = `${visual.bgColor}|${visual.textColor}|${visual.shadowColor}|${visual.weatherCategory}|${visual.floodLevel}|${visual.isPulse}`;

        const pulseClass = visual.isPulse ? "animate-pulse" : "";
        const markerHtml = `
          <div class="w-6 h-6 rounded-full shadow-md flex items-center justify-center transition-transform transform hover:scale-125 cursor-pointer ${visual.bgColor} ${visual.textColor} ${visual.shadowColor} ${pulseClass}">
            ${weatherSvg}
          </div>
        `;

        // Weather text description
        let weatherLabel = "Bình thường";
        if (visual.weatherCategory === "tornado") weatherLabel = "Giông bão";
        else if (visual.weatherCategory === "cloud-rain") weatherLabel = "Mưa rào";
        else if (visual.weatherCategory === "droplet") weatherLabel = "Mưa";

        // Flood text badge
        let floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/30 text-emerald-300 border border-emerald-500/40">🟢 Bình thường</span>`;
        if (visual.floodLevel === "LEVEL_3") {
          floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/30 text-rose-300 border border-rose-500/40">🔴 Level 3 (Ngập nặng)</span>`;
        } else if (visual.floodLevel === "LEVEL_2") {
          floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/30 text-orange-300 border border-orange-500/40">🟠 Level 2 (Ngập vừa)</span>`;
        } else if (visual.floodLevel === "LEVEL_1") {
          floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40">🟡 Level 1 (Ngập nhẹ)</span>`;
        }

        const tooltipContent = `
          <div class="p-1 min-w-[160px]">
            <div class="text-xs font-bold leading-snug">${cam.CamName}</div>
            <div class="text-[10px] text-slate-400 font-medium">${cam.District || "TP.HCM"}</div>
            <div class="mt-1.5 pt-1.5 border-t border-slate-700/60 flex items-center justify-between gap-2">
              <span class="text-[10px] font-semibold text-slate-300">${weatherLabel}</span>
              ${floodBadge}
            </div>
          </div>
        `;

        const existingMarker = currentMarkers.get(cam.CamId);

        if (existingMarker) {
          const markerAny = existingMarker as any;
          if (markerAny._visualKey !== visualKey) {
            markerAny._visualKey = visualKey;
            const customIcon = L.divIcon({
              html: markerHtml,
              className: "custom-cam-marker",
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12],
            });
            existingMarker.setIcon(customIcon);
          }
          if (markerAny._tooltipContent !== tooltipContent) {
            markerAny._tooltipContent = tooltipContent;
            existingMarker.setTooltipContent(tooltipContent);
          }
        } else {
          // Create new marker
          const customIcon = L.divIcon({
            html: markerHtml,
            className: "custom-cam-marker",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12],
          });
          const pos: [number, number] = [cam.Lat!, cam.Lng!];
          const marker = L.marker(pos, { icon: customIcon });
          const markerAny = marker as any;
          markerAny._visualKey = visualKey;
          markerAny._tooltipContent = tooltipContent;

          marker.bindTooltip(tooltipContent, {
            direction: "top",
            offset: [0, -16],
            className: isDarkMode ? "dark-leaflet-tooltip" : "light-leaflet-tooltip",
          });

          // Click marker -> Open Floating Live Preview
          marker.on("click", (e) => {
            if (e && e.originalEvent) {
              e.originalEvent.stopPropagation();
            }
            setActivePopupCam(cam);
          });

          marker.addTo(markersLayer);
          currentMarkers.set(cam.CamId, marker);
        }
      });
    },
    [isDarkMode, getMarkerVisualState, getStreamState, updateActiveViewportCameras]
  );

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    async function initLeaflet() {
      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
      }

      // Default center: Ho Chi Minh City Center
      const defaultCenter: [number, number] = [10.7769, 106.7009];
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 13,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });

      // Add Zoom control at bottom-right
      L.control
        .zoom({
          position: "bottomright",
        })
        .addTo(map);

      // Base Tile Layer
      const getTileUrl = () => {
        if (activeTabLayer === "satellite") {
          return "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
        }
        return "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      };

      const tiles = L.tileLayer(getTileUrl(), {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      }).addTo(map);

      tileLayerRef.current = tiles;

      // Markers Layer Group
      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;

      // Attach Viewport Culling Events (moveend, zoomend)
      let timer: NodeJS.Timeout | null = null;
      const onMapMove = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          updateVisibleMarkers(false);
        }, 80);
      };

      map.on("moveend", onMapMove);
      map.on("zoomend", onMapMove);

      setMapLoaded(true);
    }

    initLeaflet();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update TileLayer when Mode or Active Tab Layer changes
  useEffect(() => {
    if (!mapInstanceRef.current || !mapLoaded) return;

    import("leaflet").then((LModule) => {
      const L = LModule.default;
      if (tileLayerRef.current) {
        mapInstanceRef.current?.removeLayer(tileLayerRef.current);
      }

      let newUrl = "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}";
      if (activeTabLayer === "satellite") {
        newUrl = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
      }

      const newTile = L.tileLayer(newUrl, {
        maxZoom: 20,
        subdomains: ["mt0", "mt1", "mt2", "mt3"],
      }).addTo(mapInstanceRef.current!);

      tileLayerRef.current = newTile;
    });
  }, [activeTabLayer, mapLoaded]);

  // Re-run Viewport Culling when filter, search, district, weather or flood state change
  useEffect(() => {
    if (!mapLoaded) return;
    const shouldFit = selectedDistrict !== "all" || searchQuery.trim() !== "";
    updateVisibleMarkers(shouldFit);
  }, [
    mapCameras,
    selectedDistrict,
    searchQuery,
    mapLoaded,
    weatherMap,
    floodMap,
    updateVisibleMarkers,
  ]);

  // Handler to center HCMC
  const handleResetCenter = useCallback(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([10.7769, 106.7009], 13);
    }
  }, []);

  // Handler to fit all cameras
  const handleFitAll = useCallback(() => {
    if (mapInstanceRef.current && mapCameras.length > 0) {
      const bounds = mapCameras.map((c) => [c.Lat!, c.Lng!] as [number, number]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [60, 60] });
    }
  }, [mapCameras]);


  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. TOP FLOATING CONTROL BAR */}
      <div className="absolute top-4 left-4 right-4 z-[1000] flex items-center justify-between pointer-events-none gap-3">
        {/* Left Section: Branding & Search & District */}
        <div className="flex items-center gap-2 pointer-events-auto flex-wrap max-w-3xl">
          {/* Branding Badge with Camera Refresh Countdown */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Video className="w-4 h-4" />
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                CAMERA GIAO THÔNG
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              </span>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                <span>{visibleCount} / {mapCameras.length} trong khung nhìn</span>
                <span>•</span>
                <span className="font-mono text-blue-500 dark:text-blue-400 font-bold" title="Thời gian tự động làm mới ảnh camera">
                  Ảnh: {cameraCountdown}s
                </span>
              </div>
            </div>
          </div>

          {/* AI Weather & Flood Monitor Status Badge & Trigger Button */}
          <button
            onClick={triggerManualCheck}
            disabled={isFetchingWeather || isAnalyzingFlood}
            title="Nhấn để quét thời tiết và phân tích ngập AI ngay lập tức"
            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-2.5 text-xs hover:border-blue-500/50 hover:bg-slate-50 dark:hover:bg-slate-800/80 transition cursor-pointer disabled:opacity-75"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-500 animate-pulse" />
              <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                AI Phân tích:
              </span>
            </div>

            {isFetchingWeather ? (
              <span className="text-[10px] text-blue-500 font-medium flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Quét thời tiết...
              </span>
            ) : isAnalyzingFlood ? (
              <span className="text-[10px] text-amber-500 font-medium flex items-center gap-1">
                <Waves className="w-3 h-3 animate-bounce" /> Phân tích ảnh Gemini...
              </span>
            ) : (
              <div className="flex items-center gap-2 text-[10px]">
                <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-mono font-bold">
                  {countdown}s
                </span>
                {rainyCameraIds.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-bold">
                    🌧️ {rainyCameraIds.length} mưa
                  </span>
                )}
                {severeFloodCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold animate-pulse">
                    ⚠️ {severeFloodCount} ngập nặng
                  </span>
                )}
              </div>
            )}

            <RefreshCw
              className={`w-3 h-3 text-slate-400 hover:text-blue-500 ml-0.5 ${
                isFetchingWeather || isAnalyzingFlood ? "animate-spin text-blue-500" : ""
              }`}
            />
          </button>

          {/* Search Input Box */}
          <div className="relative bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden flex items-center w-52 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 ml-3 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm đường, quận, mã cam..."
              className="w-full px-2.5 py-2 text-xs bg-transparent text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="p-1 mr-2 text-slate-400 hover:text-slate-200 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Layer & Theme Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Layer Switcher (Road vs Satellite) */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-1 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl hidden sm:flex items-center gap-1 text-xs">
            <button
              onClick={() => setActiveTabLayer("standard")}
              className={`px-3 py-1.5 rounded-xl font-semibold transition ${
                activeTabLayer === "standard"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Đường phố
            </button>
            <button
              onClick={() => setActiveTabLayer("satellite")}
              className={`px-3 py-1.5 rounded-xl font-semibold transition ${
                activeTabLayer === "satellite"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              Vệ tinh
            </button>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={isDarkMode ? "Chuyển sang chế độ Sáng" : "Chuyển sang chế độ Tối"}
            className="p-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition active:scale-95"
          >
            {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
          </button>
        </div>
      </div>

      {/* 2. MAP CANVAS */}
      <div
        ref={mapContainerRef}
        className={`w-full h-full z-0 ${
          activeTabLayer === "satellite" ? "map-satellite-tiles" : "map-dark-tiles"
        }`}
      />

      {/* 3. RIGHT FLOATING UTILITIES */}
      <div className="absolute right-4 top-20 z-[990] flex flex-col gap-2">
        <button
          onClick={handleResetCenter}
          title="Về trung tâm TP.HCM"
          className="p-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition hover:scale-105 active:scale-95"
        >
          <Crosshair className="w-5 h-5 text-blue-500" />
        </button>
        <button
          onClick={handleFitAll}
          title="Xem toàn bộ vị trí camera"
          className="p-3 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition hover:scale-105 active:scale-95"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* 4. MAP LEGEND & FLOOD SCALE (BOTTOM-CENTER) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[900] hidden lg:flex items-center gap-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 shadow-xl flex-wrap">
        {/* Flood Severity Colors */}
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Độ ngập:</span>
          <div className="flex items-center gap-1 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 border border-white inline-block shadow-sm shadow-emerald-500" />
            <span>Bình thường (An toàn)</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white inline-block shadow-sm shadow-amber-500" />
            <span>Level 1 (Ngập nhẹ)</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-600 border border-white inline-block shadow-sm shadow-orange-600" />
            <span>Level 2 (Ngập vừa)</span>
          </div>
          <div className="flex items-center gap-1 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-600 border border-white inline-block shadow-sm shadow-rose-500 animate-pulse" />
            <span>Level 3 (Ngập nặng)</span>
          </div>
        </div>

        {/* Weather Icons Legend */}
        <div className="border-l border-slate-300 dark:border-slate-700 pl-3 flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Thời tiết:</span>
          <div className="flex items-center gap-1" title="Mã WMO 61, 63, 65">
            <Droplet className="w-3.5 h-3.5 text-blue-400" />
            <span>Mưa</span>
          </div>
          <div className="flex items-center gap-1" title="Mã WMO 80, 81, 82">
            <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mưa rào</span>
          </div>
          <div className="flex items-center gap-1" title="Mã WMO 95, 96, 99">
            <Tornado className="w-3.5 h-3.5 text-purple-400" />
            <span>Giông bão</span>
          </div>
          <div className="flex items-center gap-1" title="Các mã WMO khác">
            <Leaf className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bình thường</span>
          </div>
        </div>
      </div>

      {/* 5. FLOATING ACTIVE CAMERA LIVE PREVIEW CARD (BOTTOM-RIGHT) */}
      {activePopupCam && (
        <ActiveCameraFloatingCard
          cam={activePopupCam}
          onClose={() => setActivePopupCam(null)}
          onSelectCamera={onSelectCamera}
        />
      )}

    </div>
  );
}

/**
 * Dedicated Active Camera Floating Preview Card at Bottom-Right
 * Isolated component consuming useCameraStream(cam.CamId) with stable URL & error recovery
 */
function ActiveCameraFloatingCard({
  cam,
  onClose,
  onSelectCamera,
}: {
  cam: CameraItem;
  onClose: () => void;
  onSelectCamera?: (cam: CameraItem) => void;
}) {
  const { stream, refresh, refreshInterval } = useCameraStream(cam.CamId);
  const { getWeatherInfo, getFloodInfo } = useWeatherFloodContext();
  const { setSelectedCamera } = useCameraContext();

  const weather = getWeatherInfo(cam.CamId);
  const flood = getFloodInfo(cam.CamId);

  // Derive initial image source
  const directProxyUrl = `/api/proxy?id=${encodeURIComponent(cam.CamId)}`;
  const [currentSrc, setCurrentSrc] = useState<string>(
    () => stream.currentImgSrc || directProxyUrl
  );
  const [isLoading, setIsLoading] = useState<boolean>(!stream.currentImgSrc);
  const [hasError, setHasError] = useState<boolean>(false);

  // When camera changes
  useEffect(() => {
    setHasError(false);
    if (stream.currentImgSrc) {
      setCurrentSrc(stream.currentImgSrc);
      setIsLoading(false);
    } else {
      setCurrentSrc(`/api/proxy?id=${encodeURIComponent(cam.CamId)}&t=${Date.now()}`);
      setIsLoading(true);
    }
  }, [cam.CamId]);

  // When context stream updates
  useEffect(() => {
    if (stream.currentImgSrc) {
      setCurrentSrc(stream.currentImgSrc);
      setIsLoading(false);
      setHasError(false);
    }
  }, [stream.currentImgSrc]);

  const handleManualReload = () => {
    setIsLoading(true);
    setHasError(false);
    setCurrentSrc(`/api/proxy?id=${encodeURIComponent(cam.CamId)}&t=${Date.now()}`);
    refresh();
  };

  return (
    <div className="absolute bottom-6 right-4 z-[1000] w-[330px] sm:w-[390px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
      {/* Card Media Header */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {/* Loading Spinner Skeleton */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 gap-2 z-10">
            <RefreshCw className="w-7 h-7 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Đang tải hình ảnh camera...</span>
          </div>
        )}

        {/* Error Fallback */}
        {hasError && (
          <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-400 p-4 text-center gap-2 z-10">
            <ShieldAlert className="w-8 h-8 text-amber-500" />
            <span className="text-xs font-medium text-slate-200">Không thể tải hình ảnh camera</span>
            <button
              onClick={handleManualReload}
              className="mt-1 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-md shadow-blue-600/30 active:scale-95 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Thử lại
            </button>
          </div>
        )}

        {/* Live Image */}
        <img
          src={currentSrc}
          alt={cam.CamName}
          onLoad={() => {
            setIsLoading(false);
            setHasError(false);
          }}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          className={`w-full h-full object-cover transition-opacity duration-300 ${
            isLoading || hasError ? "opacity-0" : "opacity-100"
          }`}
        />

        {/* Live Indicator Badge */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-full text-[10px] font-bold text-white z-20">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="w-2 h-2 rounded-full bg-emerald-500 -ml-2.5" />
          <span>LIVE</span>
        </div>

        {/* Weather & Countdown Badge */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-20">
          {weather && (
            <div
              className="flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-1 rounded-full text-[10px] font-bold text-white"
              title={`WMO Weather Code: ${weather.weatherCode}`}
            >
              <WeatherIconComponent
                category={weather.category}
                className="w-3 h-3 text-cyan-400"
              />
              <span>
                {weather.category === "tornado"
                  ? "Giông sét"
                  : weather.category === "cloud-rain"
                  ? "Mưa rào"
                  : weather.category === "droplet"
                  ? "Mưa"
                  : "Bình thường"}
              </span>
            </div>
          )}

          {refreshInterval > 0 && stream.isCountingDown && (
            <div className="bg-black/75 backdrop-blur-md px-2 py-1 rounded-full text-[10px] font-mono font-semibold text-white">
              {stream.timeLeft}s
            </div>
          )}
        </div>
      </div>

      {/* Card Info Content */}
      <div className="p-4 flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
              {cam.CamName}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1 font-medium">
              <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span className="line-clamp-1">{cam.District || "TP. Hồ Chí Minh"}</span>
            </p>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Gemini AI Flood Assessment Status Banner */}
        {flood && (
          <div
            className={`p-2.5 rounded-xl border flex items-start gap-2 text-xs ${
              flood.floodLevel === "LEVEL_3"
                ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                : flood.floodLevel === "LEVEL_2"
                ? "bg-orange-600/15 border-orange-600/30 text-orange-300"
                : flood.floodLevel === "LEVEL_1"
                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                : flood.floodLevel === "LEVEL_0"
                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                : "bg-slate-500/15 border-slate-500/30 text-slate-300"
            }`}
          >
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="font-bold flex items-center justify-between">
                <span>
                  {flood.floodLevel === "LEVEL_3"
                    ? "🔴 Level 3: Ngập nặng (>40cm)"
                    : flood.floodLevel === "LEVEL_2"
                    ? "🟠 Level 2: Ngập vừa (15-40cm)"
                    : flood.floodLevel === "LEVEL_1"
                    ? "🟡 Level 1: Ngập nhẹ (<15cm)"
                    : "🟢 Level 0: Bình thường (Không ngập)"}
                </span>
                <span className="text-[10px] opacity-75 font-mono">Gemini AI</span>
              </div>
              {flood.description && (
                <p className="text-[11px] opacity-90 mt-0.5">{flood.description}</p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={handleManualReload}
            className="py-2 px-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
            title="Làm mới ảnh camera"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Làm mới</span>
          </button>
          <button
            onClick={() => {
              setSelectedCamera(cam);
              if (onSelectCamera) onSelectCamera(cam);
            }}
            className="flex-1 py-2 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-lg shadow-blue-600/20 active:scale-95 cursor-pointer"
          >
            <Eye className="w-4 h-4" />
            <span>Xem chi tiết & Phóng to</span>
          </button>
        </div>
      </div>
    </div>
  );
}
