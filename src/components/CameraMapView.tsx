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
  Camera,
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
  ChevronRight,
  Menu,
  Briefcase,
  Home,
  ExternalLink,
} from "lucide-react";
import "leaflet/dist/leaflet.css";
import type * as LeafletType from "leaflet";
import CameraWeatherCard, { CameraWeatherHeaderButton } from "./CameraWeatherCard";
import FloodHotspotsModal from "./FloodHotspotsModal";
import RoutePlannerModal from "./RoutePlannerModal";
import AboutProjectModal from "./AboutProjectModal";
import { RouteAnalysis, RoutePlanResult, SavedLocation } from "@/types/route";
import { PRESET_LOCATIONS, planSafeRoute } from "@/lib/routing";
import { isFrequentFloodCamera } from "@/data/floodHotspots";
import { getGoogleTrafficMeta, getCameraTrafficDensity } from "@/lib/google-traffic";
import { getMascotEmotionTitle } from "@/data/mascotQuotes";

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
      return `<svg class="w-3.5 h-3.5 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>`;
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
      return <Camera className={className} />;
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
    triggerManualCheck,
    getMarkerVisualState,
  } = useWeatherFloodContext();

  const {
    mascotType,
    toggleMascotType,
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
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close hamburger menu on outside click or Escape key
  useEffect(() => {
    if (!showMenuDropdown) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenuDropdown(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowMenuDropdown(false);
      }
    };

    document.addEventListener("pointerdown", handleOutsideClick, { capture: true });
    document.addEventListener("touchstart", handleOutsideClick, { capture: true });
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick, { capture: true });
      document.removeEventListener("touchstart", handleOutsideClick, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [showMenuDropdown]);

  const [zoomLevel, setZoomLevel] = useState(13);
  const [showZoomSlider, setShowZoomSlider] = useState(false);
  const routeLayersRef = useRef<LeafletType.LayerGroup | null>(null);

  // Check if first-time visitor to display welcome & terms intro dialog
  useEffect(() => {
    try {
      const hasSeen = localStorage.getItem("venha_intro_modal_seen_v1");
      if (!hasSeen) {
        setShowAboutModal(true);
      }
    } catch (e) {
      console.warn("localStorage check error:", e);
    }
  }, []);

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
        const svg = btn.querySelector("svg");
        if (svg) {
          svg.classList.add("animate-spin");
          setTimeout(() => svg.classList.remove("animate-spin"), 800);
        }
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

        const streamState = getStreamState(cam.CamId);
        const isError = streamState?.hasError;
        const opacityClass = isError ? "opacity-35 grayscale filter brightness-75" : "";

        const camMood = getMoodForCamera(cam);
        const camMascotImg = getMascotImage(camMood);

        const visualKey = `${visual.bgColor}|${visual.textColor}|${visual.shadowColor}|${visual.weatherCategory}|${visual.floodLevel}|${visual.isPulse}|${mascotType}|${camMood}|${isError}`;

        const pulseClass = visual.isPulse ? "animate-pulse" : "";
        const markerHtml = `
          <div class="w-6 h-6 rounded-full shadow-md flex items-center justify-center transition-all transform hover:scale-125 cursor-pointer ${visual.bgColor} ${visual.textColor} ${visual.shadowColor} ${pulseClass} ${opacityClass}" title="${isError ? "Camera đang tạm thời mất tín hiệu" : cam.CamName}">
            ${weatherSvg}
          </div>
        `;

        // Non-intrusive compact hover tooltip (just camera name)
        const hoverTooltip = `<div class="font-bold text-xs truncate max-w-[220px] select-none">${cam.CamName}</div>`;

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
          markerAny._hoverTooltip = hoverTooltip;

          // Non-intrusive compact hover tooltip
          marker.bindTooltip(hoverTooltip, {
            direction: "top",
            offset: [0, -14],
            className: "compact-cam-tooltip",
          });

          // Single Click: Mở Side Right Bar (Laptop) hoặc Fullscreen Modal (Mobile)
          marker.on("click", (e: any) => {
            if (e && e.originalEvent) {
              e.originalEvent.stopPropagation();
              e.originalEvent.preventDefault?.();
            }
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
      setZoomLevel(initialZoom);

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

      // Attach Viewport Culling Events (moveend, zoomend) & Zoom State Tracking
      let timer: NodeJS.Timeout | null = null;
      const onMapMove = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          updateVisibleMarkers(false);
        }, 80);
      };

      map.on("zoom", () => {
        setZoomLevel(Math.round(map.getZoom()));
      });

      map.on("moveend", onMapMove);
      map.on("zoomend", () => {
        setZoomLevel(Math.round(map.getZoom()));
        onMapMove();
      });

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
    <div className="relative w-full h-full h-[100dvh] overflow-hidden bg-slate-950 font-sans select-none">
      {/* 1. TOP FLOATING CONTROL BAR */}
      <div className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-[1000] flex items-start justify-between pointer-events-none gap-2 sm:gap-3">
        {/* Left Section: Google Maps Search Bar + Directions Button */}
        <div className="flex items-center gap-2 pointer-events-auto min-w-0 flex-1 sm:flex-initial">
          {!isRouteMode && (
            <div className="flex items-center bg-white dark:bg-slate-900 shadow-xl rounded-full border border-slate-200/90 dark:border-slate-800 px-3 sm:px-4 py-1.5 sm:py-2 w-full sm:w-auto sm:min-w-[340px] gap-2 sm:gap-3 transition-all hover:shadow-2xl text-slate-700 dark:text-slate-200">
              <button
                type="button"
                onClick={() => setIsRouteMode(true)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition cursor-pointer shrink-0"
                title="Tìm kiếm"
              >
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <div
                onClick={() => setIsRouteMode(true)}
                className="flex-1 cursor-pointer select-none truncate text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium"
              >
                Tìm kiếm đường đi
              </div>

              <div className="h-4 sm:h-5 w-[1px] bg-slate-200 dark:bg-slate-700 shrink-0" />

              {/* Google Maps Authentic Blue Directions Button */}
              <button
                type="button"
                onClick={() => setIsRouteMode(true)}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#1a73e8] hover:bg-[#1557b0] text-white flex items-center justify-center shadow-md shadow-blue-600/30 transition active:scale-95 shrink-0 cursor-pointer"
                title="Chỉ đường"
              >
                <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current transform rotate-45" />
              </button>
            </div>
          )}
        </div>

        {/* Right Section: Weather Button (Header) + Camera Status Card + Hamburger Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto shrink-0 relative">
          {/* 1. WEATHER FORECAST PILL BUTTON (Moved to Header) */}
          <CameraWeatherHeaderButton onClick={() => setShowWeatherModal(true)} />

          {/* 2. Camera Giao Thông Badge Card */}
          <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl flex items-center gap-2 sm:gap-2.5">
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/30 flex items-center justify-center p-0.5 shadow-md shadow-amber-500/10 shrink-0 overflow-hidden">
              <img
                src="/logo-cat.png"
                alt="Logo"
                className="w-full h-full object-contain transform hover:scale-110 transition-transform duration-300"
              />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[11px] sm:text-xs font-bold tracking-wide text-slate-900 dark:text-slate-100 flex items-center gap-1">
                <span className="hidden sm:inline">CAMERA GIAO THÔNG</span>
                <span className="sm:hidden">CAM</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              </span>
              <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                <span>{visibleCount}/{mapCameras.length}</span>
                <span className="hidden sm:inline">•</span>
                <span
                  suppressHydrationWarning
                  className="hidden sm:inline font-mono text-cyan-600 dark:text-cyan-400 font-bold"
                  title="Thời gian tự động đồng bộ thời tiết & cảnh báo ngập lụt toàn thành phố"
                >
                  Đồng bộ: {countdown}s
                </span>
              </div>
            </div>
          </div>

          {/* 3. HAMBURGER MENU BUTTON & DROPDOWN */}
          <div className="relative">
            <button
              onClick={() => setShowMenuDropdown((prev) => !prev)}
              title="Menu chức năng & tiện ích"
              aria-label="Menu chức năng"
              className={`p-2 sm:p-2.5 rounded-2xl backdrop-blur-md border shadow-xl transition active:scale-95 cursor-pointer flex items-center justify-center ${
                showMenuDropdown
                  ? "bg-blue-600 text-white border-blue-500 shadow-blue-500/30"
                  : "bg-white/95 dark:bg-slate-900/95 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {showMenuDropdown ? (
                <X className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              ) : (
                <Menu className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              )}
            </button>

            {/* HAMBURGER DROPDOWN MENU POPOVER */}
            {showMenuDropdown && (
              <div
                ref={menuRef}
                className="absolute top-full right-0 mt-2 w-64 sm:w-72 bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl border border-slate-200 dark:border-slate-800 rounded-3xl p-2.5 shadow-2xl z-[2000] flex flex-col gap-1 animate-in fade-in slide-in-from-top-2 duration-200 select-none text-slate-800 dark:text-slate-200"
              >
                {/* Dropdown Header */}
                <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs text-slate-800 dark:text-slate-100">Tiện ích & Cài đặt</span>
                    <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 text-[9px] font-bold">TP.HCM</span>
                  </div>
                </div>

                {/* Dropdown Menu Items */}
                <div className="flex flex-col gap-0.5 py-1">
                  {/* 1. Điểm hay ngập nước */}
                  <button
                    onClick={() => {
                      setShowMenuDropdown(false);
                      setShowHotspotsModal(true);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-300 hover:text-cyan-700 dark:hover:text-cyan-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Waves className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Điểm hay ngập nước</div>
                        <div className="text-[10px] text-slate-400 truncate">25+ điểm triều cường & mưa</div>
                      </div>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-[10px] font-bold shrink-0">25+</span>
                  </button>

                  {/* 2. Dự báo thời tiết TP.HCM */}
                  <button
                    onClick={() => {
                      setShowMenuDropdown(false);
                      setShowWeatherModal(true);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-700 dark:text-slate-300 hover:text-blue-700 dark:hover:text-blue-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Sun className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Dự báo khí tượng</div>
                        <div className="text-[10px] text-slate-400 truncate">Nhiệt độ, mưa, độ ẩm, gió</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>

                  {/* 3. Tìm đường tránh ngập */}
                  <button
                    onClick={() => {
                      setShowMenuDropdown(false);
                      setIsRouteMode(true);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Navigation className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Tìm đường tránh ngập</div>
                        <div className="text-[10px] text-slate-400 truncate">Tránh ngập & kiểm tra camera</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>

                  <div className="h-[1px] bg-slate-100 dark:bg-slate-800 my-1" />

                  {/* 4. Đổi Giao diện Sáng / Tối */}
                  <button
                    onClick={() => {
                      toggleTheme();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 dark:text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Giao diện {isDarkMode ? "Tối" : "Sáng"}</div>
                        <div className="text-[10px] text-slate-400 truncate">Chuyển sang chế độ {isDarkMode ? "Sáng" : "Tối"}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full shrink-0">
                      {isDarkMode ? "🌙 Tối" : "☀️ Sáng"}
                    </span>
                  </button>

                  {/* 5. Đổi Linh vật Bé Vịt / Bé Mèo */}
                  <button
                    onClick={() => {
                      toggleMascotType();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform text-base">
                        {mascotType === "duck" ? "🦆" : "🐱"}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Linh vật đồng hành</div>
                        <div className="text-[10px] text-slate-400 truncate">Đang chọn: {mascotType === "duck" ? "Bé Vịt" : "Bé Mèo"}</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                      Đổi sang {mascotType === "duck" ? "Mèo 🐱" : "Vịt 🦆"}
                    </span>
                  </button>

                  {/* 6. Giới thiệu & Điều khoản */}
                  <button
                    onClick={() => {
                      setShowMenuDropdown(false);
                      setShowAboutModal(true);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Info className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Giới thiệu & Điều khoản</div>
                        <div className="text-[10px] text-slate-400 truncate">Mục đích cộng đồng & bản quyền</div>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </button>

                  {/* 7. Đồng bộ thủ công */}
                  <button
                    onClick={() => {
                      triggerManualCheck();
                      setShowMenuDropdown(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <RefreshCw className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-tight truncate">Đồng bộ lại dữ liệu</div>
                        <div className="text-[10px] text-slate-400 truncate">Cập nhật camera & ngập lụt</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            )}
          </div>
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
                    🟢 Lộ trình an toàn khô ráo
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
                      Chỉ đường an toàn
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
                  <span>Đang quét camera & tính lộ trình an toàn trên bản đồ...</span>
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

                          {!isDry && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 animate-pulse">
                              ⚠️ Có ngập
                            </span>
                          )}
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
      <div className="absolute right-3 top-24 sm:right-4 sm:top-32 z-[990] flex flex-col items-end gap-1.5 sm:gap-2">
        {/* GPS Location Button (Placed First to avoid slider overlap) */}
        <button
          onClick={handleResetCenter}
          title="Định vị & phóng to vị trí hiện tại của tôi"
          className="p-2 sm:p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 shadow-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-600 dark:hover:text-blue-400 transition hover:scale-105 active:scale-95 cursor-pointer"
        >
          <Crosshair className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-500" />
        </button>

        {/* Zoom Toggle Button + Horizontal Slider Popover */}
        <div className="relative flex flex-col items-end">
          <button
            onClick={() => setShowZoomSlider((v) => !v)}
            title={`Thu phóng bản đồ · Mức ${zoomLevel}`}
            className={`p-2 sm:p-2.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border shadow-lg transition hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1 sm:gap-1.5 text-xs font-bold ${
              showZoomSlider
                ? "border-blue-400 text-blue-600 dark:text-blue-400"
                : "border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700"
            }`}
          >
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-mono tabular-nums text-[11px] sm:text-xs">{zoomLevel}×</span>
          </button>

          {/* Horizontal Zoom Slider Panel */}
          {showZoomSlider && (
            <div
              className="absolute right-0 top-full mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl p-2.5 sm:p-3 flex items-center gap-2 sm:gap-2.5 animate-in fade-in slide-in-from-top-2 duration-200 z-[1000]"
              style={{ minWidth: 180 }}
            >
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                {10}×
              </span>
              <input
                type="range"
                min={10}
                max={19}
                step={1}
                value={zoomLevel}
                onChange={(e) => {
                  const z = Number(e.target.value);
                  setZoomLevel(z);
                  mapInstanceRef.current?.setZoom(z);
                }}
                className="horizontal-zoom-slider flex-1"
                title={`Mức thu phóng: ${zoomLevel}×`}
              />
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                {19}×
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 4. MAP LEGEND & FLOOD SCALE (BOTTOM-CENTER) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[900] hidden lg:flex items-center gap-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 shadow-xl whitespace-nowrap">
        {/* Flood Severity Colors */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 border border-white inline-block shadow-sm shadow-emerald-500" />
            <span>Bình thường</span>
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
        <div className="border-l border-slate-200 dark:border-slate-700 pl-3 flex items-center gap-2.5">
          <div className="flex items-center gap-1" title="Mã WMO 51-57, 61-67 hoặc lượng mưa > 0">
            <Droplet className="w-3.5 h-3.5 text-blue-500" />
            <span>Mưa phùn</span>
          </div>
          <div className="flex items-center gap-1" title="Mã WMO 80, 81, 82 hoặc mưa lớn ≥ 2mm/h">
            <CloudRain className="w-3.5 h-3.5 text-cyan-500" />
            <span>Mưa rào</span>
          </div>
          <div className="flex items-center gap-1" title="Mã WMO 95, 96, 99">
            <Tornado className="w-3.5 h-3.5 text-purple-500" />
            <span>Giông bão</span>
          </div>
          <div className="flex items-center gap-1" title="Thời tiết khô ráo, quang đãng">
            <Camera className="w-3.5 h-3.5 text-emerald-500" />
            <span>Khô ráo</span>
          </div>
        </div>
      </div>

      {/* 5. OPEN-METEO TP. HỒ CHÍ MINH WEATHER FORECAST MODAL */}
      <CameraWeatherCard
        isOpen={showWeatherModal}
        onClose={() => setShowWeatherModal(false)}
      />

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

      {/* 8. ABOUT PROJECT & TERMS OF SERVICE MODAL */}
      <AboutProjectModal
        isOpen={showAboutModal}
        onClose={() => setShowAboutModal(false)}
      />
    </div>
  );
}
