"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useCameraContext, useCameraStream } from "@/context/CameraContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import { useMascotContext } from "@/context/MascotContext";
import { CameraItem, FloodLevel, WeatherCategory } from "@/types/camera";
import {
  Maximize2,
  Video,
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
  Info,
  Waves,
  Navigation,
  Car,
  Search,
  ArrowUpDown,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Briefcase,
  Home,
  ExternalLink,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import type * as LeafletType from "leaflet";
import CameraWeatherCard from "./CameraWeatherCard";
import FloodHotspotsModal from "./FloodHotspotsModal";
import RoutePlannerModal from "./RoutePlannerModal";
import { RouteAnalysis, RoutePlanResult, SavedLocation } from "@/types/route";
import { PRESET_LOCATIONS, planSafeRoute } from "@/lib/routing";
import { isFrequentFloodCamera } from "@/data/floodHotspots";
import { getGoogleTrafficMeta, getCameraTrafficDensity } from "@/lib/google-traffic";

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
    isDarkMode,
    toggleTheme,
    refreshAll,
    setSelectedCamera,
    refreshInterval,
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
    countdown,
    getMarkerVisualState,
  } = useWeatherFloodContext();

  const {
    mascotType,
    userLocation,
    saveUserLocation,
    getMascotImage,
    getMoodForCamera,
  } = useMascotContext();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletType.Map | null>(null);
  const markersLayerRef = useRef<LeafletType.LayerGroup | null>(null);
  const markersMapRef = useRef<Map<string, LeafletType.Marker>>(new Map());
  const tileLayerRef = useRef<LeafletType.Layer | null>(null);
  const userMarkerRef = useRef<LeafletType.Marker | null>(null);

  const [mapLoaded, setMapLoaded] = useState(false);
  const [visibleCount, setVisibleCount] = useState(0);
  const [showHotspotsModal, setShowHotspotsModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const routeLayersRef = useRef<LeafletType.LayerGroup | null>(null);

  // Filter cameras that have valid Lat & Lng
  const mapCameras = useMemo(() => {
    return filteredCameras.filter(
      (c) => typeof c.Lat === "number" && typeof c.Lng === "number" && !isNaN(c.Lat) && !isNaN(c.Lng)
    );
  }, [filteredCameras]);

  // Keep a ref of mapCameras to avoid re-binding map event listeners constantly
  const mapCamerasRef = useRef<CameraItem[]>(mapCameras);
  mapCamerasRef.current = mapCameras;

  // Route Navigation State (Google Maps On-Map Navigation)
  const [isRouteMode, setIsRouteMode] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [routeOrigin, setRouteOrigin] = useState<SavedLocation | null>(null);
  const [routeDestination, setRouteDestination] = useState<SavedLocation | null>(null);
  const [originQuery, setOriginQuery] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [originSuggestions, setOriginSuggestions] = useState<any[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<any[]>([]);
  const [activeSearchField, setActiveSearchField] = useState<"origin" | "destination" | null>(null);
  const [activeRoutePlan, setActiveRoutePlan] = useState<RoutePlanResult | null>(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isLocatingGPS, setIsLocatingGPS] = useState(false);

  // Debounced Geocoding for origin
  useEffect(() => {
    if (activeSearchField !== "origin") return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(originQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setOriginSuggestions(data);
        }
      } catch (err) {
        console.warn("[Geocode Origin] error:", err);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [originQuery, activeSearchField]);

  // Debounced Geocoding for destination
  useEffect(() => {
    if (activeSearchField !== "destination") return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(destQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setDestSuggestions(data);
        }
      } catch (err) {
        console.warn("[Geocode Dest] error:", err);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [destQuery, activeSearchField]);

  // Apply Google Maps style routes directly onto Leaflet Map
  const handleApplyRouteToMap = useCallback(
    async (planResult: RoutePlanResult, activeIdx: number = 0) => {
      if (!mapInstanceRef.current || !planResult.routes || planResult.routes.length === 0) return;
      const L = (await import("leaflet")).default;
      const activeRoute = planResult.routes[activeIdx];
      if (!activeRoute || !activeRoute.geometry || activeRoute.geometry.length === 0) return;

      if (!routeLayersRef.current) {
        routeLayersRef.current = L.layerGroup().addTo(mapInstanceRef.current);
      } else {
        routeLayersRef.current.clearLayers();
      }

      // A. Alternative routes (gray-blue, clickable)
      planResult.routes.forEach((altRoute, altIdx) => {
        if (altIdx === activeIdx) return;
        if (!altRoute.geometry || altRoute.geometry.length === 0) return;

        const altBorder = L.polyline(altRoute.geometry, {
          color: "#475569",
          weight: 9,
          opacity: 0.35,
          lineCap: "round",
          lineJoin: "round",
        });

        const altLine = L.polyline(altRoute.geometry, {
          color: "#94a3b8",
          weight: 5,
          opacity: 0.75,
          lineCap: "round",
          lineJoin: "round",
        });

        altLine.on("click", () => {
          setSelectedRouteIdx(altIdx);
          handleApplyRouteToMap(planResult, altIdx);
        });

        routeLayersRef.current?.addLayer(altBorder);
        routeLayersRef.current?.addLayer(altLine);
      });

      // B. Active Primary Route (Google Maps Navigation Style)
      const isDry = activeRoute.maxFloodLevel === "LEVEL_0";
      const outlineColor = isDry ? "#1e40af" : "#991b1b"; // Dark blue or dark red
      const coreColor = isDry ? "#2563eb" : "#ef4444"; // Google bright blue or bright red

      const routeGlow = L.polyline(activeRoute.geometry, {
        color: outlineColor,
        weight: 11,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      });

      const routeMain = L.polyline(activeRoute.geometry, {
        color: coreColor,
        weight: 6,
        opacity: 1.0,
        lineCap: "round",
        lineJoin: "round",
      });

      routeLayersRef.current.addLayer(routeGlow);
      routeLayersRef.current.addLayer(routeMain);

      // C. Google Maps Origin Marker (Blue circle with white inner dot)
      const startPt = activeRoute.geometry[0];
      const startIcon = L.divIcon({
        html: `
          <div class="flex items-center justify-center w-7 h-7 rounded-full bg-white border-[3.5px] border-blue-600 shadow-xl cursor-pointer">
            <div class="w-2.5 h-2.5 rounded-full bg-blue-600"></div>
          </div>
        `,
        className: "google-origin-pin",
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const startMarker = L.marker(startPt, { icon: startIcon, zIndexOffset: 3000 }).bindTooltip(
        `<b>Điểm xuất phát:</b> ${planResult.origin.name}`,
        { direction: "top", offset: [0, -14], className: "google-route-tooltip" }
      );
      routeLayersRef.current.addLayer(startMarker);

      // D. Google Maps Destination Marker (Classic Red Teardrop Marker + Name Label)
      const endPt = activeRoute.geometry[activeRoute.geometry.length - 1];
      const endIcon = L.divIcon({
        html: `
          <div class="relative -top-8 -left-3.5 flex items-center pointer-events-auto cursor-pointer group">
            <div class="relative w-8 h-8 flex items-center justify-center filter drop-shadow-xl">
              <svg viewBox="0 0 24 24" class="w-8 h-8 text-rose-600 fill-current">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
            </div>
            <div class="ml-1 px-2.5 py-1 rounded-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 shadow-xl whitespace-nowrap text-xs font-bold text-slate-900 dark:text-white max-w-[200px] truncate">
              ${planResult.destination.name}
            </div>
          </div>
        `,
        className: "google-dest-pin",
        iconSize: [260, 36],
        iconAnchor: [14, 34],
      });
      const endMarker = L.marker(endPt, { icon: endIcon, zIndexOffset: 3000 });
      routeLayersRef.current.addLayer(endMarker);

      // E. Google Maps ETA Duration Callout Bubble at route midpoint
      const midIdx = Math.floor(activeRoute.geometry.length / 2);
      const midPt = activeRoute.geometry[midIdx];
      const durationMin = Math.round(activeRoute.durationSeconds / 60);
      const distKm = (activeRoute.distanceMeters / 1000).toFixed(1);

      const etaIcon = L.divIcon({
        html: `
          <div class="flex flex-col items-center pointer-events-auto cursor-pointer select-none filter drop-shadow-xl">
            <div class="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border-2 ${isDry ? "border-blue-600 dark:border-blue-500" : "border-rose-600 dark:border-rose-500"
          } shadow-2xl flex items-center gap-2.5 transform hover:scale-105 transition-transform">
              <div class="flex flex-col text-left leading-tight">
                <span class="text-xs font-black ${isDry ? "text-slate-900 dark:text-white" : "text-rose-600"
          } flex items-center gap-1">
                  🚗 ${durationMin} phút
                </span>
                <span class="text-[10px] text-slate-500 font-mono font-medium">
                  ${distKm} km
                </span>
              </div>
              <div class="h-4 w-[1px] bg-slate-200 dark:bg-slate-700" />
              <span class="px-1.5 py-0.5 rounded-full text-[9px] font-bold ${isDry
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
            : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 animate-pulse"
          }">
                ${isDry ? "🟢 Né ngập" : "⚠️ Có điểm ngập"}
              </span>
            </div>
            <div class="w-3 h-3 bg-white dark:bg-slate-900 border-r-2 border-b-2 ${isDry ? "border-blue-600 dark:border-blue-500" : "border-rose-600 dark:border-rose-500"
          } transform rotate-45 -mt-1.5 shadow-sm"></div>
          </div>
        `,
        className: "google-eta-badge",
        iconSize: [160, 52],
        iconAnchor: [80, 52],
      });
      const etaMarker = L.marker(midPt, { icon: etaIcon, zIndexOffset: 2500 });
      routeLayersRef.current.addLayer(etaMarker);

      // F. Prominent Flood Warning Markers along route (like "Ho Chi Minh City floods" in Google Maps)
      const detectedFloodSpots = new Set<string>();
      activeRoute.cameras.forEach((cItem) => {
        const flood = cItem.floodInfo;
        const isFlooded =
          flood?.floodLevel === "LEVEL_3" ||
          flood?.floodLevel === "LEVEL_2" ||
          flood?.floodLevel === "LEVEL_1";
        if (isFlooded || cItem.matchedHotspot) {
          const spotKey = cItem.matchedHotspot?.street || cItem.camera.CamName;
          if (detectedFloodSpots.has(spotKey)) return;
          detectedFloodSpots.add(spotKey);

          const camPt: [number, number] = [cItem.camera.Lat!, cItem.camera.Lng!];
          const floodPin = L.divIcon({
            html: `
              <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 dark:bg-slate-900/95 border-2 border-rose-500 shadow-xl pointer-events-auto cursor-pointer transform hover:scale-105 transition-transform">
                <div class="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs animate-pulse">
                  🌊
                </div>
                <div class="flex flex-col text-left">
                  <span class="text-[10px] font-bold text-rose-600 dark:text-rose-400 truncate max-w-[130px]">
                    ${cItem.matchedHotspot?.street || cItem.camera.CamName}
                  </span>
                  <span class="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                    ${flood?.floodLevel === "LEVEL_3" ? "Ngập sâu" : flood?.floodLevel === "LEVEL_2" ? "Ngập vừa" : "Điểm ngập"}
                  </span>
                </div>
              </div>
            `,
            className: "route-flood-pin",
            iconSize: [170, 36],
            iconAnchor: [12, 18],
          });
          const flMarker = L.marker(camPt, { icon: floodPin, zIndexOffset: 2800 }).on("click", () => {
            if (onSelectCamera) onSelectCamera(cItem.camera);
          });
          routeLayersRef.current?.addLayer(flMarker);
        }
      });

      // G. Fit map bounds to view entire route
      const bounds = L.latLngBounds(activeRoute.geometry);
      mapInstanceRef.current.fitBounds(bounds, {
        paddingTopLeft: [380, 80],
        paddingBottomRight: [80, 80],
        maxZoom: 16,
      });
    },
    [onSelectCamera]
  );

  // Clear Route Layer from Map
  const handleClearRoute = useCallback(() => {
    if (routeLayersRef.current) {
      routeLayersRef.current.clearLayers();
    }
    setActiveRoutePlan(null);
    setIsRouteMode(false);
  }, []);

  // Calculate Map Route (Specifically for Flood Avoidance)
  const handleCalculateMapRoute = useCallback(
    async (customOrigin?: SavedLocation | null, customDest?: SavedLocation | null) => {
      const o = customOrigin !== undefined ? customOrigin : routeOrigin;
      const d = customDest !== undefined ? customDest : routeDestination;
      if (!o || !d) return;

      setIsCalculatingRoute(true);
      setActiveSearchField(null);
      try {
        const mascotName = mascotType === "duck" ? "Bé Vịt" : "Bé Mèo";
        const plan = await planSafeRoute(o, d, mapCameras, floodMap, mascotName);
        setActiveRoutePlan(plan);
        setSelectedRouteIdx(plan.recommendedRouteIndex);
        setIsRouteMode(true);
        await handleApplyRouteToMap(plan, plan.recommendedRouteIndex);
      } catch (err) {
        console.error("[CameraMapView] Route calculation error:", err);
      } finally {
        setIsCalculatingRoute(false);
      }
    },
    [routeOrigin, routeDestination, mapCameras, floodMap, mascotType, handleApplyRouteToMap]
  );

  // Swap Locations
  const handleSwapLocations = useCallback(() => {
    const tempOrigin = routeOrigin ? { ...routeOrigin } : null;
    const tempOriginQuery = originQuery;

    setRouteOrigin(routeDestination);
    setOriginQuery(destQuery);

    setRouteDestination(tempOrigin);
    setDestQuery(tempOriginQuery);

    setActiveSearchField(null);
    if (routeDestination && tempOrigin) {
      handleCalculateMapRoute(routeDestination, tempOrigin);
    }
  }, [routeOrigin, routeDestination, originQuery, destQuery, handleCalculateMapRoute]);

  // Use Current Location (GPS)
  const handleUseCurrentLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }
    setIsLocatingGPS(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGPS(false);
        const myLoc: SavedLocation = {
          id: "custom",
          name: "Vị trí hiện tại của tôi",
          address: "Định vị GPS thiết bị của bạn",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setRouteOrigin(myLoc);
        setOriginQuery(myLoc.name);
        setActiveSearchField(null);
        if (routeDestination) {
          handleCalculateMapRoute(myLoc, routeDestination);
        }
      },
      (err) => {
        setIsLocatingGPS(false);
        console.warn("[CameraMapView] GPS error:", err);
        alert("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [routeDestination, handleCalculateMapRoute]);

  // Global window functions for interactive popup button clicks
  useEffect(() => {
    (window as any).__venha_open_cam__ = (camId: string) => {
      const found = mapCamerasRef.current?.find((c) => c.CamId === camId);
      if (found && onSelectCamera) {
        onSelectCamera(found);
      }
    };
    (window as any).__venha_refresh_cam__ = (camId: string, btn?: HTMLElement) => {
      const img = document.getElementById(`cam-img-${camId}`) as HTMLImageElement | null;
      if (img) {
        img.src = `/api/proxy?id=${encodeURIComponent(camId)}&t=${Date.now()}`;
      }
      if (btn) {
        btn.classList.add("animate-spin");
        setTimeout(() => btn.classList.remove("animate-spin"), 800);
      }
    };
  }, [onSelectCamera]);

  // Helper to place/update User Location Marker
  const updateUserLocationMarker = useCallback(async (lat: number, lng: number) => {
    if (!mapInstanceRef.current) return;
    const L = (await import("leaflet")).default;

    const userHtml = `
      <div class="relative flex items-center justify-center w-7 h-7">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        <div class="relative inline-flex rounded-full h-5 w-5 bg-blue-600 border-2 border-white shadow-xl items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-white"></div>
        </div>
      </div>
    `;

    const userIcon = L.divIcon({
      html: userHtml,
      className: "user-location-marker-icon",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], {
        icon: userIcon,
        zIndexOffset: 1000,
      });

      marker.bindTooltip("Vị trí của bạn", {
        direction: "top",
        offset: [0, -14],
        permanent: true,
        className: "dark-leaflet-tooltip font-bold text-xs bg-blue-600 text-white border-0 px-2 py-1 rounded-md shadow-md",
      });

      marker.addTo(mapInstanceRef.current);
      userMarkerRef.current = marker;
    }
  }, []);

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

      // If user is in Route Navigation Mode, strictly show ONLY cameras along the active route corridor!
      let baseCameras = currentCameras;
      if (isRouteMode && activeRoutePlan && activeRoutePlan.routes[selectedRouteIdx]) {
        const activeRoute = activeRoutePlan.routes[selectedRouteIdx];
        const routeCamIds = new Set(activeRoute.cameras.map((c) => c.camera.CamId));
        baseCameras = currentCameras.filter((cam) => routeCamIds.has(cam.CamId));
      }

      // Viewport bounds with 15% buffer padding for smooth pan
      const viewBounds = map.getBounds().pad(0.15);

      // Only render cameras within current viewport and relevant to current route
      const visibleCams = baseCameras.filter((cam) =>
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

        const camMood = getMoodForCamera(cam);
        const camMascotImg = getMascotImage(camMood);

        const visualKey = `${visual.bgColor}|${visual.textColor}|${visual.shadowColor}|${visual.weatherCategory}|${visual.floodLevel}|${visual.isPulse}|${mascotType}|${camMood}`;

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
        else if (visual.weatherCategory === "droplet") weatherLabel = "Mưa / Mưa phùn";

        // Flood text badge
        const isRainZone =
          visual.weatherCategory === "droplet" ||
          visual.weatherCategory === "cloud-rain" ||
          visual.weatherCategory === "tornado";

        let floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${isRainZone
          ? "bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30"
          : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
          }">🟢 ${isRainZone ? "Bình thường (Đường ướt)" : "Bình thường (Khô ráo)"}</span>`;

        if (visual.floodLevel === "LEVEL_3") {
          floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/30 text-rose-300 border border-rose-500/40">🔴 Level 3 (Ngập nặng)</span>`;
        } else if (visual.floodLevel === "LEVEL_2") {
          floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/30 text-orange-300 border border-orange-500/40">🟠 Level 2 (Ngập vừa)</span>`;
        } else if (visual.floodLevel === "LEVEL_1") {
          floodBadge = `<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/30 text-amber-300 border border-amber-500/40">🟡 Level 1 (Ngập nhẹ)</span>`;
        }

        // Mascot Tip & Real-time Traffic Tracking
        let camTip = "Đường khô ráo, chạy êm ru!";
        const isHotspot = isFrequentFloodCamera(cam);
        const flood = floodMap[cam.CamId];
        const trafficInfo = getCameraTrafficDensity(cam, flood);
        const trafficDensity = trafficInfo.level;
        const trafficMeta = trafficInfo.meta;

        if (visual.floodLevel === "LEVEL_3") {
          camTip = mascotType === "duck" ? "Ngập sâu trên 40cm, né gấp nha! 🦆🚨" : "Ngập sâu ướt lông rồi, quay đầu meow! 🐱🚨";
        } else if (visual.floodLevel === "LEVEL_2") {
          camTip = mascotType === "duck" ? "Nước ngập nửa bánh xe, đi chậm nha! 🦆⚠️" : "Ngập vừa 15-40cm, lái vững tay meow! 🐱🛵";
        } else if (visual.floodLevel === "LEVEL_1") {
          camTip = mascotType === "duck" ? "Đường ngập nhẹ mắt cá chân! 🦆⚠️" : "Ngập nhẹ mép vỉa hè, đi chậm kẻo té meow! 🐱💦";
        } else if (trafficDensity === "jam") {
          camTip = mascotType === "duck" ? "Khu vực này kẹt xe khá đông, né đoạn này đi nha! 🦆🛑" : "Đường đang kẹt xe rồi, né đoạn này đi meow! 🐱🛑";
        } else if (trafficDensity === "high") {
          camTip = mascotType === "duck" ? "Đoạn này xe đông di chuyển chậm, chạy cẩn thận nha! 🦆🚗" : "Đường đông xe lắm, chạy cẩn thận meow! 🐱🚗";
        } else if (camMood === "rain" || isRainZone) {
          camTip = mascotType === "duck" ? "Trời đang mưa, đường trơn chạy chậm nha! 🦆🌧️" : "Đường trơn ướt, giữ đều ga an toàn meow! 🐱☔";
        }

        const aiDesc =
          flood?.description ||
          (isHotspot
            ? "Điểm trũng triều cường - Tuyến đường thông suốt"
            : "Thời tiết thông thoáng - Tuyến đường khô ráo, không ngập");

        // Non-intrusive compact hover tooltip (just camera name)
        const hoverTooltip = `<div class="font-bold text-xs truncate max-w-[220px]">${cam.CamName}</div>`;

        // Rich Comprehensive Popup Card on Single Click (Card to hơn: 400px-440px, 2 nút icon: Làm mới & Chi tiết)
        const popupContent = `
          <div class="w-[380px] sm:w-[430px] bg-white/98 dark:bg-slate-900/98 text-slate-900 dark:text-white backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800 rounded-[28px] p-4 shadow-2xl overflow-hidden font-sans select-none pointer-events-auto">
            <!-- 1. Live Camera Preview (Large 16:9 Image) -->
            <div
              onclick="event.stopPropagation(); window.__venha_open_cam__ && window.__venha_open_cam__('${cam.CamId}');"
              class="relative w-full aspect-video rounded-2xl overflow-hidden bg-slate-950 mb-3 border border-slate-200/80 dark:border-slate-800 shadow-inner group cursor-pointer"
              title="Nhấn vào ảnh để xem chi tiết phóng to"
            >
              <img
                id="cam-img-${cam.CamId}"
                src="/api/proxy?id=${encodeURIComponent(cam.CamId)}"
                alt="${cam.CamName}"
                loading="lazy"
                class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
              />
              <div style="display:none;" class="absolute inset-0 items-center justify-center text-xs text-slate-400 bg-slate-900">
                Không có tín hiệu camera
              </div>
              
              <!-- Badges on image -->
              <div class="absolute top-2.5 left-2.5 flex items-center gap-1.5 pointer-events-none z-10">
                <div class="px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1.5 shadow-md">
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                  <span class="w-2 h-2 rounded-full bg-emerald-500 -ml-2"></span>
                  LIVE
                </div>
                ${isHotspot ? `<span class="px-2.5 py-1 rounded-full bg-cyan-600/90 backdrop-blur-md text-[10px] font-bold text-white flex items-center gap-1 shadow-md">🌊 Hay ngập triều</span>` : ''}
              </div>

              <!-- Hover hint overlay -->
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all duration-200 flex items-center justify-center pointer-events-none">
                <div class="opacity-0 group-hover:opacity-100 transition-opacity duration-200 px-3.5 py-1.5 rounded-full bg-blue-600/95 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 shadow-xl transform translate-y-1 group-hover:translate-y-0">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>
                  <span>Phóng to chi tiết</span>
                </div>
              </div>
            </div>

            <!-- 2. Camera Name & District -->
            <div class="flex items-start justify-between gap-2.5 mb-2.5">
              <div class="min-w-0 flex-1">
                <h4 class="text-sm sm:text-base font-bold leading-tight truncate text-slate-900 dark:text-slate-100" title="${cam.CamName}">${cam.CamName}</h4>
                <div class="text-[11px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span>📍 ${cam.District || "TP.HCM"}</span>
                  <span>•</span>
                  <span class="font-semibold text-blue-600 dark:text-blue-400">${weatherLabel}</span>
                  ${flood?.isRaining ? '<span class="text-cyan-600 dark:text-cyan-400 font-bold">• 🌧️ Có mưa</span>' : ''}
                  <span>•</span>
                  <span class="px-2 py-0.5 rounded-full border text-[10px] font-semibold ${trafficMeta.pillClass}">🚗 ${trafficMeta.label}</span>
                </div>
              </div>
              <div class="shrink-0 pt-0.5">
                ${floodBadge}
              </div>
            </div>

            <!-- 3. Mascot Warning & Advice -->
            <div class="p-3 rounded-2xl bg-blue-50/70 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 flex items-center gap-3 mb-2.5 shadow-sm">
              <div class="w-10 h-10 rounded-2xl overflow-hidden bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 p-0.5 shrink-0 shadow-sm flex items-center justify-center">
                <img src="${camMascotImg}" class="w-full h-full object-contain" alt="Mascot" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  ${mascotType === 'duck' ? '🦆 Bé Vịt nhắc bạn:' : '🐱 Bé Mèo nhắc bạn:'}
                </div>
                <p class="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5 leading-snug">
                  ${camTip}
                </p>
              </div>
            </div>

            <!-- 4. Real-time Road & Flood Analysis Status -->
            <div class="px-3 py-2 rounded-xl border flex items-center justify-between text-xs mb-3 ${visual.floodLevel === 'LEVEL_3'
            ? 'bg-rose-500/15 border-rose-500/30 text-rose-600 dark:text-rose-300'
            : visual.floodLevel === 'LEVEL_2'
              ? 'bg-orange-500/15 border-orange-500/30 text-orange-600 dark:text-orange-300'
              : visual.floodLevel === 'LEVEL_1'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-300'
                : isRainZone
                  ? 'bg-sky-500/15 border-sky-500/30 text-sky-700 dark:text-sky-300'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-300'
          }">
              <div class="flex items-center gap-2 truncate">
                <span class="w-2 h-2 rounded-full shrink-0 ${visual.floodLevel === 'LEVEL_3' ? 'bg-rose-500 animate-ping' : visual.floodLevel === 'LEVEL_2' ? 'bg-orange-500' : visual.floodLevel === 'LEVEL_1' ? 'bg-amber-500' : isRainZone ? 'bg-sky-500' : 'bg-emerald-500'
          }"></span>
                <span class="truncate font-semibold">${aiDesc}</span>
              </div>
              <span class="text-[9px] font-mono opacity-75 shrink-0 ml-1.5 uppercase font-bold text-slate-500 dark:text-slate-400">Trực tiếp</span>
            </div>

            <!-- 5. 2 Action Buttons with Icons (Làm mới & Chi tiết phóng to) -->
            <div class="grid grid-cols-2 gap-2.5 pt-2.5 border-t border-slate-200/80 dark:border-slate-800">
              <!-- Nút 1: Làm mới (Icon RefreshCw) -->
              <button
                onclick="event.stopPropagation(); window.__venha_refresh_cam__ && window.__venha_refresh_cam__('${cam.CamId}', this);"
                class="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-sm border border-slate-200/60 dark:border-slate-700/60"
                title="Tải lại hình ảnh snapshot mới nhất"
              >
                <svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
                <span>Làm mới</span>
              </button>

              <!-- Nút 2: Chi tiết phóng to (Icon Eye / Zoom) -->
              <button
                onclick="event.stopPropagation(); window.__venha_open_cam__ && window.__venha_open_cam__('${cam.CamId}');"
                class="py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer shadow-md shadow-blue-600/30"
                title="Mở dialog chi tiết lớn phóng to"
              >
                <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>Chi tiết</span>
              </button>
            </div>
          </div>
        `;

        const existingMarker = currentMarkers.get(cam.CamId);

        if (existingMarker) {
          const markerAny = existingMarker as any;
          markerAny._camData = cam;
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
          if (markerAny._popupContent !== popupContent) {
            markerAny._popupContent = popupContent;
            existingMarker.setPopupContent(popupContent);
          }
          if (markerAny._hoverTooltip !== hoverTooltip) {
            markerAny._hoverTooltip = hoverTooltip;
            existingMarker.setTooltipContent(hoverTooltip);
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
          markerAny._camData = cam;
          markerAny._visualKey = visualKey;
          markerAny._popupContent = popupContent;
          markerAny._hoverTooltip = hoverTooltip;

          // Non-intrusive compact hover tooltip
          marker.bindTooltip(hoverTooltip, {
            direction: "top",
            offset: [0, -14],
            className: "compact-cam-tooltip",
          });

          // Single Click (Click 1 lần): Mở Card hiển thị ảnh to kèm 3 nút icon
          marker.bindPopup(popupContent, {
            maxWidth: 480,
            minWidth: 400,
            offset: [0, -12],
            className: "custom-cam-popup",
            autoPan: true,
            autoPanPadding: [20, 20],
          });

          // Double Click (Nhấn 2 lần): Mở thẳng Dialog Chi Tiết Lớn (CameraModal)
          marker.on("dblclick", (e: any) => {
            if (e && e.originalEvent) {
              e.originalEvent.stopPropagation();
              e.originalEvent.preventDefault?.();
            }
            marker.closePopup();
            const targetCam = markerAny._camData || cam;
            if (onSelectCamera) {
              onSelectCamera(targetCam);
            }
          });

          marker.addTo(markersLayer);
          currentMarkers.set(cam.CamId, marker);
        }
      });
    },
    [
      isDarkMode,
      mascotType,
      getMascotImage,
      getMoodForCamera,
      getMarkerVisualState,
      getStreamState,
      updateActiveViewportCameras,
      isRouteMode,
      activeRoutePlan,
      selectedRouteIdx,
    ]
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

      // Default center: Ho Chi Minh City Center (or saved user location)
      const defaultCenter: [number, number] = userLocation
        ? [userLocation.lat, userLocation.lng]
        : [10.7769, 106.7009];

      const initialZoom = userLocation ? 15 : 13;

      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: initialZoom,
        zoomControl: false,
        attributionControl: false,
        preferCanvas: true,
      });

      // If user location is already known, show marker immediately
      if (userLocation) {
        updateUserLocationMarker(userLocation.lat, userLocation.lng);
      }

      // Add Zoom control at bottom-right
      L.control
        .zoom({
          position: "bottomright",
        })
        .addTo(map);

      // Base Tile Layer (Google Maps Standard with Live Traffic)
      const initialTileLayer = L.tileLayer(
        "https://{s}.google.com/vt/lyrs=m,traffic&hl=vi&x={x}&y={y}&z={z}",
        {
          maxZoom: 20,
          subdomains: ["mt0", "mt1", "mt2", "mt3"],
        }
      ).addTo(map);

      tileLayerRef.current = initialTileLayer;

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

      // Attempt Geolocation to locate, add user location pin, save location & zoom to nearby cameras
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!isMounted || !mapInstanceRef.current) return;
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            saveUserLocation(userLat, userLng);
            updateUserLocationMarker(userLat, userLng);
            mapInstanceRef.current.setView([userLat, userLng], 15);
            updateVisibleMarkers(false);
          },
          (error) => {
            console.warn("Geolocation prompt or access denied/failed:", error);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      }

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



  // Re-run Viewport Culling when filter, district, weather, flood, mascot type, or route state change
  useEffect(() => {
    if (!mapLoaded) return;
    const shouldFit = selectedDistrict !== "all";
    updateVisibleMarkers(shouldFit);
  }, [
    mapCameras,
    selectedDistrict,
    mapLoaded,
    weatherMap,
    floodMap,
    mascotType,
    isRouteMode,
    activeRoutePlan,
    selectedRouteIdx,
    updateVisibleMarkers,
  ]);

  // Handler to locate & center user's location (or default to HCMC center)
  const handleResetCenter = useCallback(() => {
    if (!mapInstanceRef.current) return;
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (mapInstanceRef.current) {
            const userLat = position.coords.latitude;
            const userLng = position.coords.longitude;
            saveUserLocation(userLat, userLng);
            updateUserLocationMarker(userLat, userLng);
            mapInstanceRef.current.setView([userLat, userLng], 15);
            updateVisibleMarkers(false);
          }
        },
        () => {
          if (userLocation) {
            mapInstanceRef.current?.setView([userLocation.lat, userLocation.lng], 15);
          } else {
            mapInstanceRef.current?.setView([10.7769, 106.7009], 13);
          }
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else if (userLocation) {
      mapInstanceRef.current.setView([userLocation.lat, userLocation.lng], 15);
    } else {
      mapInstanceRef.current.setView([10.7769, 106.7009], 13);
    }
  }, [saveUserLocation, updateUserLocationMarker, updateVisibleMarkers, userLocation]);

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
      <div className="absolute top-4 left-4 right-4 z-[1000] flex items-start justify-between pointer-events-none gap-3">
        {/* Left Section: Google Maps Search Bar + Directions Button */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {!isRouteMode && (
            <div className="flex items-center bg-white dark:bg-slate-900 shadow-xl rounded-full border border-slate-200/90 dark:border-slate-800 px-4 py-2 min-w-[280px] sm:min-w-[360px] gap-3 transition-all hover:shadow-2xl text-slate-700 dark:text-slate-200">
              <button
                type="button"
                onClick={() => setIsRouteMode(true)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer"
                title="Tìm kiếm"
              >
                <Search className="w-5 h-5" />
              </button>

              <div
                onClick={() => setIsRouteMode(true)}
                className="flex-1 cursor-pointer select-none truncate text-sm text-slate-500 dark:text-slate-400 font-medium"
              >
                Tìm kiếm đường đi né ngập...
              </div>

              <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-700 shrink-0" />

              {/* Google Maps Authentic Blue Directions Button */}
              <button
                type="button"
                onClick={() => setIsRouteMode(true)}
                className="w-8 h-8 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white flex items-center justify-center shadow-md shadow-blue-600/30 transition active:scale-95 shrink-0 cursor-pointer"
                title="Chỉ đường"
              >
                <Navigation className="w-4 h-4 fill-current transform rotate-45" />
              </button>
            </div>
          )}
        </div>

        {/* Right Section: Card CAMERA GIAO THÔNG (top) + Điểm hay ngập (directly underneath) */}
        <div className="flex flex-col items-end gap-2 pointer-events-auto">
          {/* Row 1: Camera Giao Thông Card + Theme Toggle */}
          <div className="flex items-center gap-2">
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 flex items-center justify-center p-0.5 shadow-md shadow-amber-500/10 shrink-0 overflow-hidden">
                <img
                  src="/logo-cat.png"
                  alt="Logo Mèo Mặc Áo Mưa"
                  className="w-full h-full object-contain transform hover:scale-110 transition-transform duration-300"
                />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  CAMERA GIAO THÔNG
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
                </span>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  <span>{visibleCount} / {mapCameras.length} trong khung nhìn</span>
                  <span>•</span>
                  <span
                    suppressHydrationWarning
                    className="font-mono text-cyan-600 dark:text-cyan-400 font-bold"
                    title="Thời gian tự động đồng bộ thời tiết & cảnh báo ngập lụt toàn thành phố"
                  >
                    Thời tiết & Ngập: {countdown}s
                  </span>
                </div>
              </div>
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

          {/* Row 2: Tidal & Frequent Flood Hotspots Button (Right underneath Card Camera Giao Thông) */}
          <button
            onClick={() => setShowHotspotsModal(true)}
            className="px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 shadow-xl flex items-center gap-1.5 text-xs font-bold hover:bg-cyan-50 dark:hover:bg-slate-800 transition active:scale-95 group self-end"
            title="Xem danh sách các tuyến đường thường xuyên ngập nước do triều cường & mưa lớn tại TP.HCM"
          >
            <Waves className="w-4 h-4 text-cyan-500 animate-pulse group-hover:scale-110 transition-transform" />
            <span className="font-semibold">Điểm hay ngập</span>
            <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-bold">25+</span>
          </button>
        </div>
      </div>

      {/* 1.1 GOOGLE MAPS FLOATING DIRECTIONS PANEL (Directly on Map - Flood Avoidance Only) */}
      {isRouteMode && (
        <div className="absolute top-4 left-4 z-[1000] w-[calc(100vw-32px)] sm:w-[410px] pointer-events-auto select-none animate-fadeIn">
          {isPanelCollapsed ? (
            /* Minimized Collapsed Bar */
            <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-blue-500/40 rounded-2xl p-2.5 shadow-2xl flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <span className="font-bold text-slate-900 dark:text-white truncate block">
                    🚗 {activeRoutePlan?.routes[selectedRouteIdx] ? `${Math.round(activeRoutePlan.routes[selectedRouteIdx].durationSeconds / 60)} phút (${(activeRoutePlan.routes[selectedRouteIdx].distanceMeters / 1000).toFixed(1)} km)` : "Đang tìm đường..."}
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    🟢 Lộ trình né ngập an toàn
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setIsPanelCollapsed(false)}
                  title="Mở rộng chi tiết"
                  className="px-2.5 py-1 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-1 transition"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>Mở rộng</span>
                </button>
                <button
                  onClick={handleClearRoute}
                  title="Xóa lộ trình & đóng"
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 text-slate-500 hover:text-rose-600 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Expanded Google Maps Directions Card */
            <div className="bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl p-4 space-y-3 transition-all">
              {/* Header: Title + Collapse + Close */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#1a73e8] text-white flex items-center justify-center shadow-md shadow-blue-600/30">
                    <Navigation className="w-3.5 h-3.5 fill-current transform rotate-45" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      Chỉ đường né ngập
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setIsPanelCollapsed(true)}
                    title="Thu nhỏ bảng điều khiển để ngắm bản đồ"
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    onClick={handleClearRoute}
                    title="Xóa lộ trình & đóng"
                    className="p-1.5 rounded-xl bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/60 text-slate-600 hover:text-rose-600 dark:text-slate-300 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Google Maps Authentic 3-Column Directions Input Layout */}
              <div className="flex items-center gap-2.5">
                {/* 1. Left Pin & Dotted Line Indicator Column */}
                <div className="flex flex-col items-center justify-between py-2 shrink-0 self-stretch w-4">
                  {/* Top Hollow Circle (Origin) */}
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-700 dark:border-slate-300 bg-transparent shrink-0" />
                  {/* Vertical 3 Dots */}
                  <div className="flex flex-col items-center gap-0.5 my-1">
                    <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
                    <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
                    <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-500" />
                  </div>
                  {/* Bottom Red Google Pin (Destination) */}
                  <div className="text-red-600 dark:text-red-500 shrink-0">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                    </svg>
                  </div>
                </div>

                {/* 2. Middle Column: Origin & Destination Inputs */}
                <div className="flex-1 space-y-2 min-w-0">
                  {/* Origin Input */}
                  <div className="relative border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/80 rounded-xl px-3 py-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition shadow-xs">
                    <input
                      type="text"
                      value={originQuery}
                      onChange={(e) => {
                        setOriginQuery(e.target.value);
                        setActiveSearchField("origin");
                      }}
                      onFocus={() => setActiveSearchField("origin")}
                      placeholder="Vị trí của bạn (Điểm đi)..."
                      className="bg-transparent text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none flex-1 min-w-0"
                    />
                    {originQuery && (
                      <button
                        onClick={() => {
                          setRouteOrigin(null);
                          setOriginQuery("");
                          setActiveSearchField("origin");
                        }}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={handleUseCurrentLocation}
                      title="Dùng vị trí GPS hiện tại của tôi"
                      className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 transition cursor-pointer"
                    >
                      <MapPin className={`w-3.5 h-3.5 ${isLocatingGPS ? "animate-spin" : ""}`} />
                    </button>

                    {/* Autocomplete Dropdown for Origin */}
                    {activeSearchField === "origin" && originSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-48 overflow-y-auto p-1">
                        {originSuggestions.map((item, idx) => (
                          <button
                            key={`sug-orig-${idx}`}
                            onClick={() => {
                              const newLoc: SavedLocation = {
                                id: "custom",
                                name: item.name,
                                address: item.address,
                                lat: item.lat,
                                lng: item.lng,
                              };
                              setRouteOrigin(newLoc);
                              setOriginQuery(item.name);
                              setActiveSearchField(null);
                              if (routeDestination) {
                                handleCalculateMapRoute(newLoc, routeDestination);
                              }
                            }}
                            className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex items-start gap-2 cursor-pointer text-xs"
                          >
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                {item.address}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Destination Input */}
                  <div className="relative border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/80 rounded-xl px-3 py-2 flex items-center gap-2 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition shadow-xs">
                    <input
                      type="text"
                      value={destQuery}
                      onChange={(e) => {
                        setDestQuery(e.target.value);
                        setActiveSearchField("destination");
                      }}
                      onFocus={() => setActiveSearchField("destination")}
                      placeholder="Chọn điểm đến..."
                      className="bg-transparent text-xs sm:text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none flex-1 min-w-0"
                    />
                    {destQuery && (
                      <button
                        onClick={() => {
                          setRouteDestination(null);
                          setDestQuery("");
                          setActiveSearchField("destination");
                        }}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Autocomplete Dropdown for Destination */}
                    {activeSearchField === "destination" && destSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-48 overflow-y-auto p-1">
                        {destSuggestions.map((item, idx) => (
                          <button
                            key={`sug-dest-${idx}`}
                            onClick={() => {
                              const newLoc: SavedLocation = {
                                id: "custom",
                                name: item.name,
                                address: item.address,
                                lat: item.lat,
                                lng: item.lng,
                              };
                              setRouteDestination(newLoc);
                              setDestQuery(item.name);
                              setActiveSearchField(null);
                              if (routeOrigin) {
                                handleCalculateMapRoute(routeOrigin, newLoc);
                              }
                            }}
                            className="w-full text-left p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex items-start gap-2 cursor-pointer text-xs"
                          >
                            <MapPin className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                                {item.name}
                              </div>
                              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                {item.address}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Right Column: Swap Button */}
                <div className="shrink-0 flex items-center justify-center">
                  <button
                    onClick={handleSwapLocations}
                    title="Đổi chiều điểm đi và điểm đến"
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition active:scale-95 cursor-pointer"
                  >
                    <ArrowUpDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Route Results & Detour Options */}
              {isCalculatingRoute ? (
                <div className="py-4 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                  <span>Đang quét camera & tính lộ trình né ngập trên bản đồ...</span>
                </div>
              ) : activeRoutePlan ? (
                <div className="space-y-2.5 pt-1">
                  {/* Route Options Chips */}
                  <div className="space-y-1.5">
                    {activeRoutePlan.routes.map((r, rIdx) => {
                      const isSelected = rIdx === selectedRouteIdx;
                      const isDry = r.maxFloodLevel === "LEVEL_0";
                      const distKm = (r.distanceMeters / 1000).toFixed(1);
                      const durMin = Math.round(r.durationSeconds / 60);

                      return (
                        <div
                          key={`map-route-opt-${rIdx}`}
                          onClick={() => {
                            setSelectedRouteIdx(rIdx);
                            handleApplyRouteToMap(activeRoutePlan, rIdx);
                          }}
                          className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${isSelected
                            ? "bg-blue-50/90 dark:bg-blue-950/60 border-blue-600 ring-2 ring-blue-500/20 shadow-md"
                            : "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 hover:border-slate-300"
                            }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 border ${isSelected
                                ? "border-blue-600 bg-blue-600 text-white"
                                : "border-slate-400 bg-white"
                                }`}
                            >
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">
                                  {durMin} phút ({distKm} km)
                                </span>
                                {r.isRecommended && (
                                  <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[9px] font-bold">
                                    Khuyên dùng
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500 truncate block">
                                {r.name}
                              </span>
                            </div>
                          </div>

                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${isDry
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 animate-pulse"
                              }`}
                          >
                            {isDry ? "🟢 Khô ráo" : "⚠️ Có ngập"}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Mascot Speech Bubble Advice */}
                  {activeRoutePlan.mascotQuote && (
                    <div className="p-2.5 rounded-2xl bg-amber-50/80 dark:bg-slate-800/60 border border-amber-200/80 dark:border-amber-500/20 flex items-start gap-2.5 text-xs">
                      <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-700 border border-amber-200 p-0.5 shrink-0 flex items-center justify-center shadow-xs">
                        <img
                          src={getMascotImage(
                            activeRoutePlan.routes[selectedRouteIdx]?.maxFloodLevel === "LEVEL_0"
                              ? "sunny"
                              : "flood"
                          )}
                          alt="Mascot"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-300 italic flex-1 leading-snug">
                        &ldquo;{activeRoutePlan.mascotQuote}&rdquo;
                      </p>
                    </div>
                  )}

                  {/* Quick Bottom Action Buttons */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200 dark:border-slate-800 text-xs">
                    <button
                      onClick={() => setShowTimelineModal(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5 transition active:scale-95"
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600" />
                      <span>Xem chi tiết lộ trình</span>
                    </button>

                    <button
                      onClick={() => {
                        if (routeOrigin && routeDestination) {
                          const url = `https://www.google.com/maps/dir/?api=1&origin=${routeOrigin.lat},${routeOrigin.lng}&destination=${routeDestination.lat},${routeDestination.lng}&travelmode=driving`;
                          window.open(url, "_blank");
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-600/20"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Google Maps</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* 2. MAP CANVAS */}
      <div
        ref={mapContainerRef}
        className="w-full h-full z-0 map-dark-tiles"
      />

      {/* 3. RIGHT FLOATING UTILITIES */}
      <div className="absolute right-4 top-32 sm:top-36 z-[990] flex flex-col gap-2">
        <button
          onClick={handleResetCenter}
          title="Định vị & phóng to vị trí hiện tại của tôi"
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
          <div className="flex items-center gap-1" title="Mã WMO 51-57, 61-67 hoặc lượng mưa > 0">
            <Droplet className="w-3.5 h-3.5 text-blue-400" />
            <span>Mưa / Mưa phùn</span>
          </div>
          <div className="flex items-center gap-1" title="Mã WMO 80, 81, 82 hoặc mưa lớn ≥ 2mm/h">
            <CloudRain className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mưa rào</span>
          </div>
          <div className="flex items-center gap-1" title="Mã WMO 95, 96, 99">
            <Tornado className="w-3.5 h-3.5 text-purple-400" />
            <span>Giông bão</span>
          </div>
          <div className="flex items-center gap-1" title="Thời tiết khô ráo, quang đãng">
            <Leaf className="w-3.5 h-3.5 text-emerald-400" />
            <span>Khô ráo</span>
          </div>
        </div>
      </div>

      {/* 5. OPEN-METEO TP. HỒ CHÍ MINH WEATHER FORECAST CARD (BOTTOM-RIGHT) */}
      <CameraWeatherCard />

      {/* 6. FLOOD HOTSPOTS MODAL */}
      <FloodHotspotsModal
        isOpen={showHotspotsModal}
        onClose={() => setShowHotspotsModal(false)}
        allCameras={mapCameras}
        onFlyToCamera={(cam) => {
          if (mapInstanceRef.current && typeof cam.Lat === "number" && typeof cam.Lng === "number") {
            mapInstanceRef.current.flyTo([cam.Lat, cam.Lng], 16, { duration: 1.2 });
            if (onSelectCamera) {
              onSelectCamera(cam);
            }
          }
        }}
      />

      {/* 7. ROUTE PLANNER & FLOOD AVOIDANCE MODAL */}
      <RoutePlannerModal
        isOpen={showTimelineModal}
        onClose={() => setShowTimelineModal(false)}
        allCameras={mapCameras}
        initialOrigin={routeOrigin}
        initialDestination={routeDestination}
        initialPlan={activeRoutePlan}
        onApplyRouteToMap={async (routeAnalysis) => {
          if (activeRoutePlan) {
            const idx = activeRoutePlan.routes.findIndex((r) => r.id === routeAnalysis.id);
            await handleApplyRouteToMap(activeRoutePlan, idx >= 0 ? idx : 0);
          }
        }}
        onSelectCamera={(cam) => {
          if (onSelectCamera) onSelectCamera(cam);
        }}
      />
    </div>
  );
}
