"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { CameraItem } from "@/types/camera";
import { RouteAnalysis, RoutePlanResult, SavedLocation, CameraOnRoute } from "@/types/route";
import { PRESET_LOCATIONS, planSafeRoute } from "@/lib/routing";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import { useMascotContext } from "@/context/MascotContext";
import { getCameraTrafficDensity } from "@/lib/google-traffic";
import {
  Navigation,
  MapPin,
  ArrowUpDown,
  Car,
  Clock,
  RefreshCw,
  ExternalLink,
  Copy,
  Check,
  ShieldAlert,
  Eye,
  Waves,
  X,
  Search,
  Crosshair,
  Compass,
  Activity,
} from "lucide-react";
import type * as LeafletType from "leaflet";

interface RoutePlannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  allCameras: CameraItem[];
  initialOrigin?: SavedLocation | null;
  initialDestination?: SavedLocation | null;
  initialPlan?: RoutePlanResult | null;
  onApplyRouteToMap?: (route: RouteAnalysis) => void;
  onSelectCamera?: (cam: CameraItem) => void;
}

interface GeocodeItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export default function RoutePlannerModal({
  isOpen,
  onClose,
  allCameras,
  initialOrigin,
  initialDestination,
  initialPlan,
  onApplyRouteToMap,
  onSelectCamera,
}: RoutePlannerModalProps) {
  const { floodMap } = useWeatherFloodContext();
  const { mascotType, getMascotImage } = useMascotContext();

  // Selected Origin and Destination
  const [origin, setOrigin] = useState<SavedLocation | null>(initialOrigin || null);
  const [destination, setDestination] = useState<SavedLocation | null>(initialDestination || null);

  // Search input query states
  const [originQuery, setOriginQuery] = useState(initialOrigin?.name || "");
  const [destinationQuery, setDestinationQuery] = useState(initialDestination?.name || "");

  // Suggestions state
  const [originSuggestions, setOriginSuggestions] = useState<GeocodeItem[]>([]);
  const [destSuggestions, setDestSuggestions] = useState<GeocodeItem[]>([]);
  const [activeSearchField, setActiveSearchField] = useState<"origin" | "destination" | null>(null);
  const [isLoadingGeocode, setIsLoadingGeocode] = useState(false);
  const [isLocatingUser, setIsLocatingUser] = useState(false);

  // Active camera hovered/selected on the map
  const [hoveredCam, setHoveredCam] = useState<CameraOnRoute | null>(null);

  // Loading and result state
  const [isRouting, setIsRouting] = useState(false);
  const [routePlan, setRoutePlan] = useState<RoutePlanResult | null>(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [copiedText, setCopiedText] = useState(false);

  // Mini Embedded Map refs
  const miniMapContainerRef = useRef<HTMLDivElement | null>(null);
  const miniMapInstanceRef = useRef<LeafletType.Map | null>(null);
  const miniMapRouteLayersRef = useRef<LeafletType.LayerGroup | null>(null);

  // Debounced geocode search for Origin
  useEffect(() => {
    if (activeSearchField !== "origin" || !originQuery.trim()) {
      setOriginSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoadingGeocode(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(originQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setOriginSuggestions(data);
        }
      } catch (err) {
        console.warn("[Geocode Origin] Search error:", err);
      } finally {
        setIsLoadingGeocode(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [originQuery, activeSearchField]);

  // Debounced geocode search for Destination
  useEffect(() => {
    if (activeSearchField !== "destination" || !destinationQuery.trim()) {
      setDestSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoadingGeocode(true);
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(destinationQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setDestSuggestions(data);
        }
      } catch (err) {
        console.warn("[Geocode Dest] Search error:", err);
      } finally {
        setIsLoadingGeocode(false);
      }
    }, 280);
    return () => clearTimeout(timer);
  }, [destinationQuery, activeSearchField]);

  // Calculate safe route
  const handleCalculateRoute = useCallback(
    async (customOrigin?: SavedLocation, customDest?: SavedLocation) => {
      const o = customOrigin || origin;
      const d = customDest || destination;

      if (!o || !d) {
        alert("Vui lòng chọn cả Điểm xuất phát và Điểm đến để tìm đường.");
        return;
      }

      setIsRouting(true);
      setActiveSearchField(null);
      try {
        const mascotName = mascotType === "duck" ? "Bé Vịt" : "Bé Mèo";
        const result = await planSafeRoute(o, d, allCameras, floodMap, mascotName);
        setRoutePlan(result);
        setSelectedRouteIdx(result.recommendedRouteIndex);
      } catch (err) {
        console.error("[RoutePlanner] Error calculating route:", err);
      } finally {
        setIsRouting(false);
      }
    },
    [origin, destination, allCameras, floodMap, mascotType]
  );

  // Swap locations (Điểm xuất phát ⇄ Điểm đến)
  const handleSwapLocations = useCallback(() => {
    if (!origin && !destination) return;
    const tempOrigin = origin ? { ...origin } : null;
    const tempOriginQuery = originQuery;

    setOrigin(destination);
    setOriginQuery(destinationQuery);

    setDestination(tempOrigin);
    setDestinationQuery(tempOriginQuery);

    setActiveSearchField(null);

    if (destination && tempOrigin) {
      handleCalculateRoute(destination, tempOrigin);
    }
  }, [origin, destination, originQuery, destinationQuery, handleCalculateRoute]);

  // Use GPS location for origin
  const handleUseCurrentLocation = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      alert("Trình duyệt không hỗ trợ định vị GPS.");
      return;
    }
    setIsLocatingUser(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingUser(false);
        const myLocation: SavedLocation = {
          id: "custom",
          name: "Vị trí hiện tại của tôi",
          address: "Định vị GPS thiết bị của bạn",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setOrigin(myLocation);
        setOriginQuery(myLocation.name);
        setActiveSearchField(null);
        if (destination) {
          handleCalculateRoute(myLocation, destination);
        }
      },
      (err) => {
        setIsLocatingUser(false);
        console.warn("[GPS] Location error:", err);
        alert("Không thể lấy vị trí hiện tại. Vui lòng cho phép quyền truy cập vị trí.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [destination, handleCalculateRoute]);

  // Active route being inspected
  const activeRoute = routePlan?.routes[selectedRouteIdx] || null;

  // Synchronize hovered camera on route change (default to first flooded camera or first camera)
  useEffect(() => {
    if (!activeRoute || !activeRoute.cameras || activeRoute.cameras.length === 0) {
      setHoveredCam(null);
      return;
    }
    const flooded = activeRoute.cameras.find(
      (c) => c.floodInfo?.floodLevel && c.floodInfo.floodLevel !== "LEVEL_0"
    );
    setHoveredCam(flooded || activeRoute.cameras[0]);
  }, [activeRoute]);

  // Synchronize origin, destination, and calculated plan from outer card whenever modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialOrigin) {
        setOrigin(initialOrigin);
        setOriginQuery(initialOrigin.name);
      }
      if (initialDestination) {
        setDestination(initialDestination);
        setDestinationQuery(initialDestination.name);
      }
      if (initialPlan) {
        setRoutePlan(initialPlan);
        setSelectedRouteIdx(initialPlan.recommendedRouteIndex || 0);
      } else if (initialOrigin && initialDestination) {
        handleCalculateRoute(initialOrigin, initialDestination);
      }
    }
  }, [isOpen, initialOrigin, initialDestination, initialPlan, handleCalculateRoute]);

  // Mascot avatar for recommendation
  const mascotImg = getMascotImage(
    activeRoute?.maxFloodLevel === "LEVEL_3" || activeRoute?.maxFloodLevel === "LEVEL_2"
      ? "flood"
      : "sunny"
  );

  // Embedded Mini Leaflet Route Map Renderer (Left Column)
  useEffect(() => {
    if (!isOpen || !activeRoute || !miniMapContainerRef.current) return;

    let isMounted = true;
    const currentRoute = activeRoute;

    async function renderMiniMap() {
      const L = (await import("leaflet")).default;
      if (!isMounted || !miniMapContainerRef.current || !currentRoute) return;

      // 1. Initialize Map instance if not exists
      if (!miniMapInstanceRef.current) {
        const map = L.map(miniMapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
          preferCanvas: true,
        });

        // Add Google Roadmap + Real-time Traffic Tile Layer
        L.tileLayer(
          "https://mt0.google.com/vt?lyrs=m,traffic&x={x}&y={y}&z={z}",
          { maxZoom: 20 }
        ).addTo(map);

        L.control.zoom({ position: "bottomright" }).addTo(map);
        miniMapInstanceRef.current = map;
      }

      const map = miniMapInstanceRef.current;

      // 2. Setup Route Layer Group
      if (!miniMapRouteLayersRef.current) {
        miniMapRouteLayersRef.current = L.layerGroup().addTo(map);
      } else {
        miniMapRouteLayersRef.current.clearLayers();
      }

      const layers = miniMapRouteLayersRef.current;
      if (!currentRoute.geometry || currentRoute.geometry.length === 0) return;

      // A. Draw Route Polyline (Google Navigation Blue)
      const isDry = currentRoute.maxFloodLevel === "LEVEL_0";
      const outlineColor = isDry ? "#1e40af" : "#991b1b";
      const coreColor = isDry ? "#2563eb" : "#ef4444";

      const polyGlow = L.polyline(currentRoute.geometry, {
        color: outlineColor,
        weight: 10,
        opacity: 0.85,
        lineCap: "round",
        lineJoin: "round",
      });
      const polyMain = L.polyline(currentRoute.geometry, {
        color: coreColor,
        weight: 6,
        opacity: 1.0,
        lineCap: "round",
        lineJoin: "round",
      });
      layers.addLayer(polyGlow);
      layers.addLayer(polyMain);

      // B. Origin Marker (Start)
      const startPt = currentRoute.geometry[0];
      const startIcon = L.divIcon({
        html: `
          <div class="flex items-center justify-center w-6 h-6 rounded-full bg-white border-[3px] border-blue-600 shadow-xl cursor-pointer">
            <div class="w-2 h-2 rounded-full bg-blue-600"></div>
          </div>
        `,
        className: "mini-origin-pin",
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      const startMarker = L.marker(startPt, { icon: startIcon, zIndexOffset: 2000 }).bindTooltip(
        `<b>Điểm xuất phát:</b> ${origin?.name || "Khởi hành"}`,
        { direction: "top", offset: [0, -12] }
      );
      layers.addLayer(startMarker);

      // C. Destination Marker (End)
      const endPt = currentRoute.geometry[currentRoute.geometry.length - 1];
      const endIcon = L.divIcon({
        html: `
          <div class="relative -top-6 -left-3 flex items-center pointer-events-auto cursor-pointer">
            <svg viewBox="0 0 24 24" class="w-7 h-7 text-rose-600 fill-current drop-shadow-md">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `,
        className: "mini-dest-pin",
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      });
      const endMarker = L.marker(endPt, { icon: endIcon, zIndexOffset: 2000 }).bindTooltip(
        `<b>Điểm đến:</b> ${destination?.name || "Đích đến"}`,
        { direction: "top", offset: [0, -26] }
      );
      layers.addLayer(endMarker);

      // D. Render ONLY Cameras along this route corridor
      currentRoute.cameras.forEach((cItem, cIdx) => {
        const cam = cItem.camera;
        const flood = cItem.floodInfo;
        const level = flood?.floodLevel || "LEVEL_0";
        const isFlooded = level === "LEVEL_3" || level === "LEVEL_2" || level === "LEVEL_1";

        const markerColorClass =
          level === "LEVEL_3"
            ? "bg-rose-600 text-white animate-pulse"
            : level === "LEVEL_2"
              ? "bg-orange-500 text-white"
              : level === "LEVEL_1"
                ? "bg-amber-500 text-white"
                : "bg-cyan-600 text-white";

        const camIcon = L.divIcon({
          html: `
            <div class="w-6 h-6 rounded-full shadow-lg flex items-center justify-center font-bold text-[10px] border-2 border-white cursor-pointer transform hover:scale-125 transition-transform ${markerColorClass}">
              ${cIdx + 1}
            </div>
          `,
          className: "mini-cam-pin",
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const camMarker = L.marker([cam.Lat!, cam.Lng!], {
          icon: camIcon,
          zIndexOffset: isFlooded ? 1500 : 1000,
        });

        // Hover & click listeners to update Right Column Preview
        camMarker.on("mouseover", () => setHoveredCam(cItem));
        camMarker.on("click", () => setHoveredCam(cItem));

        layers.addLayer(camMarker);

        // If flooded, add a prominent badge
        if (isFlooded || cItem.matchedHotspot) {
          const floodCallout = L.divIcon({
            html: `
              <div class="px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[9px] shadow-lg border border-white whitespace-nowrap animate-bounce cursor-pointer">
                🌊 ${cItem.matchedHotspot?.street || cam.CamName}
              </div>
            `,
            className: "mini-flood-callout",
            iconSize: [120, 20],
            iconAnchor: [60, 28],
          });
          const flMarker = L.marker([cam.Lat!, cam.Lng!], {
            icon: floodCallout,
            zIndexOffset: 1600,
          });
          flMarker.on("mouseover", () => setHoveredCam(cItem));
          flMarker.on("click", () => setHoveredCam(cItem));
          layers.addLayer(flMarker);
        }
      });

      // E. Fit Bounds smoothly
      const bounds = L.latLngBounds(currentRoute.geometry);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
      map.invalidateSize();
    }

    renderMiniMap();

    return () => {
      isMounted = false;
    };
  }, [isOpen, activeRoute, origin, destination]);

  // Clean up Leaflet mini map on modal close
  useEffect(() => {
    if (!isOpen && miniMapInstanceRef.current) {
      miniMapInstanceRef.current.remove();
      miniMapInstanceRef.current = null;
      miniMapRouteLayersRef.current = null;
    }
  }, [isOpen]);

  // Copy route summary
  const handleCopySummary = () => {
    if (!activeRoute) return;
    const text = `🚗 Lộ trình: ${origin?.name || "Khởi hành"} ➔ ${destination?.name || "Điểm đến"}\n` +
      `📏 Quãng đường: ${(activeRoute.distanceMeters / 1000).toFixed(1)} km | ⏱️ Dự kiến: ${Math.round(activeRoute.durationSeconds / 60)} phút\n` +
      `🌊 Tình trạng: ${activeRoute.maxFloodLevel === "LEVEL_0" ? "Khô ráo (An toàn)" : `Cảnh báo ngập (${activeRoute.maxFloodLevel})`}\n` +
      `📹 ${activeRoute.cameras.length} camera giao thông dọc đường đã được kiểm tra!`;
    navigator.clipboard.writeText(text);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Open Google Maps navigation in new tab
  const handleOpenGoogleMaps = () => {
    if (!origin || !destination) return;
    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    window.open(url, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[99999] bg-slate-950/75 backdrop-blur-xl flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn select-none">
      {/* Backdrop click to close */}
      <div
        className="fixed inset-0 -z-10"
        onClick={() => {
          setActiveSearchField(null);
          onClose();
        }}
      />

      {/* Main Modal Card */}
      <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-cyan-500/40 w-full max-w-5xl rounded-3xl overflow-hidden shadow-2xl flex flex-col my-auto transition-all max-h-[92vh]">
        {/* 1. HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 shadow-md">
              <Navigation className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Chi Tiết Lộ Trình An Toàn
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold">
                  Bản Đồ & Camera Trực Tiếp
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bản đồ lộ trình tương tác & Phân tích hình ảnh camera trực tiếp
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition active:scale-95 border border-slate-200 dark:border-slate-700/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 2. BODY CONTENT */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-4">
          {/* A. ORIGIN & DESTINATION SEARCH BOX (Generic & Clean) */}
          <div className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 relative">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center relative">
              {/* 1. Điểm xuất phát (Origin) */}
              <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm focus-within:border-cyan-500 transition">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Điểm xuất phát (Nơi khởi hành)
                  </span>
                  <button
                    onClick={handleUseCurrentLocation}
                    title="Lấy vị trí GPS hiện tại của tôi"
                    className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <MapPin className={`w-3 h-3 ${isLocatingUser ? "animate-spin" : ""}`} />
                    Vị trí của tôi
                  </button>
                </div>

                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={originQuery}
                    onChange={(e) => {
                      setOriginQuery(e.target.value);
                      setActiveSearchField("origin");
                    }}
                    onFocus={() => setActiveSearchField("origin")}
                    placeholder="Nhập điểm xuất phát (hoặc bấm chọn GPS)..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 transition"
                  />
                  {originQuery && (
                    <button
                      onClick={() => {
                        setOrigin(null);
                        setOriginQuery("");
                        setActiveSearchField("origin");
                      }}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {origin?.address && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-cyan-500 shrink-0" />
                    <span className="truncate">{origin.address}</span>
                  </div>
                )}

                {/* Autocomplete Dropdown for Origin */}
                {activeSearchField === "origin" && originSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-56 overflow-y-auto p-1.5">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Gợi ý địa điểm</span>
                      {isLoadingGeocode && <RefreshCw className="w-3 h-3 animate-spin text-cyan-500" />}
                    </div>

                    {originSuggestions.map((item, idx) => (
                      <button
                        key={`orig-sug-${idx}`}
                        onClick={() => {
                          const newLoc: SavedLocation = {
                            id: "custom",
                            name: item.name,
                            address: item.address,
                            lat: item.lat,
                            lng: item.lng,
                          };
                          setOrigin(newLoc);
                          setOriginQuery(item.name);
                          setActiveSearchField(null);
                          if (destination) {
                            handleCalculateRoute(newLoc, destination);
                          }
                        }}
                        className="w-full text-left p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex items-start gap-2.5 cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.address}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Swap Button */}
              <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
                <button
                  onClick={handleSwapLocations}
                  title="Đổi chiều: Điểm xuất phát ⇄ Điểm đến"
                  className="p-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30 transition hover:scale-110 active:scale-95 border-2 border-white dark:border-slate-900 cursor-pointer"
                >
                  <ArrowUpDown className="w-4 h-4" />
                </button>
              </div>

              {/* 2. Điểm đến (Destination) */}
              <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-sm focus-within:border-amber-500 transition">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    Điểm đến (Nơi muốn đến)
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Đích đến</span>
                </div>

                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-slate-400 absolute left-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={destinationQuery}
                    onChange={(e) => {
                      setDestinationQuery(e.target.value);
                      setActiveSearchField("destination");
                    }}
                    onFocus={() => setActiveSearchField("destination")}
                    placeholder="Nhập điểm đến (trường học, công ty, nhà riêng)..."
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-8 py-2 text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
                  />
                  {destinationQuery && (
                    <button
                      onClick={() => {
                        setDestination(null);
                        setDestinationQuery("");
                        setActiveSearchField("destination");
                      }}
                      className="absolute right-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {destination?.address && (
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 truncate flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="truncate">{destination.address}</span>
                  </div>
                )}

                {/* Autocomplete Dropdown for Destination */}
                {activeSearchField === "destination" && destSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl max-h-56 overflow-y-auto p-1.5">
                    <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Gợi ý địa điểm đến</span>
                      {isLoadingGeocode && <RefreshCw className="w-3 h-3 animate-spin text-amber-500" />}
                    </div>

                    {destSuggestions.map((item, idx) => (
                      <button
                        key={`dest-sug-${idx}`}
                        onClick={() => {
                          const newLoc: SavedLocation = {
                            id: "custom",
                            name: item.name,
                            address: item.address,
                            lat: item.lat,
                            lng: item.lng,
                          };
                          setDestination(newLoc);
                          setDestinationQuery(item.name);
                          setActiveSearchField(null);
                          if (origin) {
                            handleCalculateRoute(origin, newLoc);
                          }
                        }}
                        className="w-full text-left p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition flex items-start gap-2.5 cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.address}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Calculate Action */}
            <div className="flex items-center justify-end pt-1 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => handleCalculateRoute()}
                disabled={isRouting || !originQuery || !destinationQuery}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-emerald-600 hover:from-blue-500 hover:to-emerald-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-cyan-600/20 flex items-center gap-2 transition active:scale-95 disabled:opacity-40 cursor-pointer"
              >
                {isRouting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang tính lộ trình...</span>
                  </>
                ) : (
                  <>
                    <Car className="w-4 h-4" />
                    <span>Tìm Lộ Trình</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* B. ROUTE ALTERNATIVES & MASCOT ADVICE */}
          {routePlan && activeRoute && (
            <div className="space-y-3">
              {/* Mascot Recommendation Banner */}
              <div className="bg-gradient-to-r from-blue-50 via-indigo-50/70 to-blue-50 dark:from-slate-900 dark:via-indigo-950/70 dark:to-slate-900 border border-blue-200 dark:border-cyan-500/40 rounded-2xl p-3.5 shadow-md flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-500/30 p-1 shrink-0 flex items-center justify-center shadow-sm">
                  <img src={mascotImg} alt="Mascot" className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider flex items-center gap-1">
                    {mascotType === "duck" ? "🦆 Bé Vịt Thông Báo" : "🐱 Bé Mèo Thông Báo"}
                    <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold">
                      Tránh ngập thông minh
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5 leading-snug">
                    &ldquo;{routePlan.mascotQuote}&rdquo;
                  </p>
                </div>
              </div>

              {/* Route Alternative Selector Cards */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {routePlan.routes.map((r, idx) => {
                  const isSelected = selectedRouteIdx === idx;
                  const isSafe = r.maxFloodLevel === "LEVEL_0";
                  const isDanger = r.maxFloodLevel === "LEVEL_3" || r.maxFloodLevel === "LEVEL_2";

                  return (
                    <button
                      key={r.id}
                      onClick={() => {
                        setSelectedRouteIdx(idx);
                        if (onApplyRouteToMap) onApplyRouteToMap(r);
                      }}
                      className={`px-3.5 py-2.5 rounded-2xl border text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${isSelected
                        ? "bg-cyan-600 text-white border-cyan-400 shadow-lg shadow-cyan-600/30"
                        : "bg-white dark:bg-slate-900/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800"
                        }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${isDanger ? "bg-rose-500 animate-ping" : isSafe ? "bg-emerald-500" : "bg-amber-400"
                          }`}
                      />
                      <div className="flex flex-col text-left">
                        <span className="flex items-center gap-1">
                          {r.name}
                          {r.isRecommended && (
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded-full font-extrabold ${isSelected ? "bg-amber-400 text-slate-900" : "bg-emerald-500/20 text-emerald-600"
                                }`}
                            >
                              Khuyên dùng ★
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-[10px] font-normal ${isSelected ? "text-cyan-100" : "text-slate-500 dark:text-slate-400"
                            }`}
                        >
                          {(r.distanceMeters / 1000).toFixed(1)} km • {Math.round(r.durationSeconds / 60)} phút • {r.cameras.length} camera
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Action Bar (Google Maps, Copy) */}
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-3 text-slate-700 dark:text-slate-300">
                  <span className="font-bold flex items-center gap-1">
                    <Car className="w-3.5 h-3.5 text-blue-500" />
                    {(activeRoute.distanceMeters / 1000).toFixed(1)} km
                  </span>
                  <span>•</span>
                  <span className="font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    {Math.round(activeRoute.durationSeconds / 60)} phút
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1 font-semibold">
                    <ShieldAlert
                      className={`w-3.5 h-3.5 ${activeRoute.maxFloodLevel === "LEVEL_0"
                        ? "text-emerald-500"
                        : activeRoute.maxFloodLevel === "LEVEL_3"
                          ? "text-rose-500"
                          : "text-amber-500"
                        }`}
                    />
                    <b>
                      {activeRoute.maxFloodLevel === "LEVEL_0"
                        ? "Khô ráo (An toàn)"
                        : activeRoute.maxFloodLevel === "LEVEL_3"
                          ? "Báo động: Ngập nặng (>40cm)"
                          : activeRoute.maxFloodLevel === "LEVEL_2"
                            ? "Cảnh báo: Ngập vừa (15-40cm)"
                            : "Đọng nước nhẹ (<15cm)"}
                    </b>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopySummary}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer shadow-xs"
                  >
                    {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedText ? "Đã chép" : "Sao chép"}</span>
                  </button>

                  <button
                    onClick={handleOpenGoogleMaps}
                    className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Google Maps</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* C. 2-COLUMN SPLIT: LEFT MAP (ROUTE & CAMERAS) + RIGHT DETAIL PREVIEW */}
          {activeRoute && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start pt-1">
              {/* LEFT COLUMN: INTERACTIVE EMBEDDED ROUTE MAP (7 COLS) */}
              <div className="lg:col-span-7 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-inner flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs px-1">
                  <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 text-blue-600" />
                    Bản đồ lộ trình & Camera dọc tuyến ({activeRoute.cameras.length} trạm)
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    💡 Rê chuột / Nhấp vào camera để soi ảnh trực tiếp
                  </span>
                </div>

                {/* Leaflet Embedded Map */}
                <div
                  ref={miniMapContainerRef}
                  className="w-full h-[460px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-800 relative shadow-inner z-0"
                />
              </div>

              {/* RIGHT COLUMN: LIVE SNAPSHOT & CONDITION CARD (5 COLS) */}
              <div className="lg:col-span-5 sticky top-2">
                {hoveredCam ? (
                  <div className="rounded-2xl border border-slate-200 dark:border-cyan-500/40 bg-white dark:bg-slate-900 p-3.5 shadow-xl transition-all animate-fadeIn">
                    {/* Preview Header */}
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-cyan-500/15 text-cyan-700 dark:text-cyan-400 font-bold text-xs flex items-center justify-center border border-cyan-500/30 shrink-0">
                          #{activeRoute.cameras.findIndex((c) => c.camera.CamId === hoveredCam.camera.CamId) + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 block">
                            Ảnh chụp trực tiếp (Camera)
                          </span>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {hoveredCam.camera.CamName}
                          </h4>
                        </div>
                      </div>

                      {/* Flood Severity Tag */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${hoveredCam.floodInfo?.floodLevel === "LEVEL_3"
                          ? "bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/40 animate-pulse"
                          : hoveredCam.floodInfo?.floodLevel === "LEVEL_2"
                            ? "bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/40"
                            : hoveredCam.floodInfo?.floodLevel === "LEVEL_1"
                              ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                              : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30"
                          }`}
                      >
                        {hoveredCam.floodInfo?.floodLevel === "LEVEL_3"
                          ? "🔴 Ngập nặng"
                          : hoveredCam.floodInfo?.floodLevel === "LEVEL_2"
                            ? "🟠 Ngập vừa"
                            : hoveredCam.floodInfo?.floodLevel === "LEVEL_1"
                              ? "🟡 Ngập nhẹ"
                              : "🟢 Khô ráo"}
                      </span>
                    </div>

                    {/* Camera Live Snapshot Image */}
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-950 mb-3 border border-slate-200 dark:border-slate-800 shadow-inner group">
                      <img
                        id={`preview-route-cam-${hoveredCam.camera.CamId}`}
                        src={`/api/proxy?id=${encodeURIComponent(hoveredCam.camera.CamId)}`}
                        alt={hoveredCam.camera.CamName}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-1.5 pointer-events-none">
                        <span className="px-2 py-0.5 rounded-full bg-black/75 backdrop-blur-md text-[9px] font-bold text-white flex items-center gap-1 border border-white/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          LIVE CAMERA
                        </span>
                      </div>

                      <div className="absolute bottom-2 right-2 flex items-center gap-1">
                        <span className="px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[9px] font-mono text-slate-200">
                          Cách xuất phát: {(hoveredCam.distanceFromStartMeters / 1000).toFixed(1)} km
                        </span>
                      </div>
                    </div>

                    {/* Road Condition & Hotspot Notice */}
                    <div className="space-y-2 mb-3">
                      {hoveredCam.matchedHotspot && (
                        <div className="px-2.5 py-1.5 rounded-xl bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800/50 text-cyan-800 dark:text-cyan-300 text-[11px] flex items-center gap-2 font-medium">
                          <Waves className="w-4 h-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                          <span className="truncate">
                            Điểm ngập triều cường: {hoveredCam.matchedHotspot.street} ({hoveredCam.matchedHotspot.causeLabel})
                          </span>
                        </div>
                      )}

                      {(() => {
                        const hTraffic = getCameraTrafficDensity(hoveredCam.camera, hoveredCam.floodInfo);
                        return (
                          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px] pb-1 border-b border-slate-200/80 dark:border-slate-800/80">
                              <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1">
                                <Activity className="w-3.5 h-3.5 text-blue-500" />
                                Lưu lượng xe:
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${hTraffic.meta.pillClass}`}>
                                🚗 {hTraffic.meta.label} ({hTraffic.meta.speedEstimate})
                              </span>
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                              Tình trạng mặt đường
                            </div>
                            <p className="text-slate-700 dark:text-slate-300 text-xs italic">
                              &ldquo;{hoveredCam.floodInfo?.description || "Tuyến đường thông suốt, xe cộ lưu thông bình thường, không ghi nhận ngập úng."}&rdquo;
                            </p>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Action Buttons: Refresh & Detail Modal */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
                      <button
                        onClick={() => {
                          const img = document.getElementById(`preview-route-cam-${hoveredCam.camera.CamId}`) as HTMLImageElement;
                          if (img) img.src = `/api/proxy?id=${encodeURIComponent(hoveredCam.camera.CamId)}&t=${Date.now()}`;
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1.5 transition active:scale-95 cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Làm mới ảnh</span>
                      </button>

                      <button
                        onClick={() => {
                          if (onSelectCamera) onSelectCamera(hoveredCam.camera);
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1.5 transition active:scale-95 shadow-md shadow-blue-600/20 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Xem chi tiết</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-8 text-center text-slate-400 text-xs">
                    Rê chuột vào một camera trên bản đồ bên trái để xem ảnh trực tiếp.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
