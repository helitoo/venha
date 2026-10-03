import { CameraItem, CameraFloodAnalysis, FloodLevel } from "@/types/camera";
import { FREQUENT_FLOOD_HOTSPOTS, FloodHotspot, getMatchingHotspot } from "@/data/floodHotspots";
import { RouteAnalysis, RoutePlanResult, SavedLocation, CameraOnRoute } from "@/types/route";

// Popular predefined locations in HCMC for quick 1-click selection
export const PRESET_LOCATIONS: SavedLocation[] = [
  {
    id: "work",
    name: "Quận 1 - Tòa nhà Bitexco / Phố đi bộ",
    lat: 10.7716,
    lng: 106.7044,
    address: "Hải Triều, Bến Nghé, Quận 1",
  },
  {
    id: "work",
    name: "Bình Thạnh - Landmark 81",
    lat: 10.7951,
    lng: 106.7218,
    address: "720A Điện Biên Phủ, Phường 22, Bình Thạnh",
  },
  {
    id: "work",
    name: "TP. Thủ Đức - Khu Công Nghệ Cao",
    lat: 10.8542,
    lng: 106.7865,
    address: "Xa Lộ Hà Nội, TP. Thủ Đức",
  },
  {
    id: "home",
    name: "Quận 7 - Phú Mỹ Hưng (Crescent Mall)",
    lat: 10.7294,
    lng: 106.7219,
    address: "Nguyễn Văn Linh, Tân Phú, Quận 7",
  },
  {
    id: "home",
    name: "Quận 7 - Trần Xuân Soạn (Bờ Kênh Tẻ)",
    lat: 10.7558,
    lng: 106.7112,
    address: "Trần Xuân Soạn, Tân Kiểng, Quận 7",
  },
  {
    id: "home",
    name: "TP. Thủ Đức - Chợ Thủ Đức (Võ Văn Ngân)",
    lat: 10.8498,
    lng: 106.7537,
    address: "Võ Văn Ngân, Linh Chiểu, TP. Thủ Đức",
  },
  {
    id: "home",
    name: "Bình Thạnh - Hàng Xanh / Bạch Đằng",
    lat: 10.8016,
    lng: 106.7115,
    address: "Bạch Đằng, Phường 24, Bình Thạnh",
  },
  {
    id: "home",
    name: "Gò Vấp - Quang Trung / Phan Huy Ích",
    lat: 10.8351,
    lng: 106.6575,
    address: "Phan Huy Ích, Phường 14, Gò Vấp",
  },
];

// Helper: Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper: Shortest distance from a point to a polyline segment in meters
function distToSegmentMeters(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const dAB = haversineMeters(aLat, aLng, bLat, bLng);
  if (dAB === 0) return haversineMeters(pLat, pLng, aLat, aLng);

  const cosLat = Math.cos(((aLat + bLat) * Math.PI) / 360);
  const dx = (bLng - aLng) * cosLat;
  const dy = bLat - aLat;
  const px = (pLng - aLng) * cosLat;
  const py = pLat - aLat;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);
  return haversineMeters(pLat, pLng, projLat, projLng);
}

/**
/**
 * Fetch driving directions using Google Directions or OSRM (via /api/directions).
 * Requests alternatives=true to get up to 3 alternative routes.
 */
export async function fetchOsrmRoutes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<Array<{
  geometry: [number, number][]; // [lat, lng] array
  distance: number;
  duration: number;
  name: string;
}>> {
  // 1. Try our Next.js API route (which checks Google Maps API Key first, then OSRM)
  try {
    const internalUrl = `/api/directions?originLat=${origin.lat}&originLng=${origin.lng}&destLat=${destination.lat}&destLng=${destination.lng}`;
    const apiRes = await fetch(internalUrl);
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (data.routes && data.routes.length > 0) {
        return data.routes;
      }
    }
  } catch (apiErr) {
    console.warn("[Routing] Internal /api/directions call failed, falling back to direct OSRM:", apiErr);
  }

  // 2. Direct fallback to public OSRM server
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || "No routes found");
    }

    return data.routes.map((r: any, idx: number) => {
      const rawCoords = r.geometry?.coordinates || [];
      const geometry: [number, number][] = rawCoords.map((pt: [number, number]) => [pt[1], pt[0]]);
      const primaryRoad = r.legs?.[0]?.steps?.[0]?.name || `Tuyến đường ${idx + 1}`;
      const mainWay = r.legs?.[0]?.summary || primaryRoad;

      return {
        geometry,
        distance: r.distance || 0,
        duration: r.duration || 0,
        name: mainWay || `Lộ trình ${idx + 1}`,
      };
    });
  } catch (err) {
    console.warn("[Routing] Direct OSRM fetch failed, generating fallback path:", err);
    return [
      {
        geometry: [
          [origin.lat, origin.lng],
          [destination.lat, destination.lng],
        ],
        distance: haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng),
        duration: Math.round(
          (haversineMeters(origin.lat, origin.lng, destination.lat, destination.lng) / 1000 / 30) * 3600
        ),
        name: "Lộ trình ước tính trực tiếp",
      },
    ];
  }
}

/**
 * Scan all cameras and flood hotspots along a route polyline.
 * Orders cameras sequentially by their distance from the starting point.
 */
export function scanRouteCameras(
  geometry: [number, number][],
  allCameras: CameraItem[],
  floodMap: Record<string, CameraFloodAnalysis>,
  thresholdMeters = 180
): {
  cameras: CameraOnRoute[];
  hotspots: FloodHotspot[];
  maxFloodLevel: FloodLevel;
  floodedCount: number;
} {
  if (geometry.length === 0 || allCameras.length === 0) {
    return {
      cameras: [],
      hotspots: [],
      maxFloodLevel: "LEVEL_0",
      floodedCount: 0,
    };
  }

  const startPt = geometry[0];
  const matchedCameras: CameraOnRoute[] = [];
  const foundHotspots = new Set<FloodHotspot>();

  allCameras.forEach((cam) => {
    if (typeof cam.Lat !== "number" || typeof cam.Lng !== "number" || isNaN(cam.Lat) || isNaN(cam.Lng)) {
      return;
    }

    // Check distance to each segment of the route
    let minDistance = Infinity;
    for (let i = 0; i < geometry.length - 1; i++) {
      const a = geometry[i];
      const b = geometry[i + 1];
      const d = distToSegmentMeters(cam.Lat, cam.Lng, a[0], a[1], b[0], b[1]);
      if (d < minDistance) {
        minDistance = d;
      }
      if (minDistance <= thresholdMeters) {
        break; // within range
      }
    }

    if (minDistance <= thresholdMeters) {
      const distanceFromStart = haversineMeters(startPt[0], startPt[1], cam.Lat, cam.Lng);
      const floodInfo = floodMap[cam.CamId];
      const matchedHotspot = getMatchingHotspot(cam.CamName);

      if (matchedHotspot) {
        foundHotspots.add(matchedHotspot);
      }

      matchedCameras.push({
        camera: cam,
        distanceFromStartMeters: distanceFromStart,
        floodInfo,
        matchedHotspot,
      });
    }
  });

  // Sort cameras sequentially along the route path
  matchedCameras.sort((a, b) => a.distanceFromStartMeters - b.distanceFromStartMeters);

  // Determine overall worst flood level
  let maxFloodLevel: FloodLevel = "LEVEL_0";
  let floodedCount = 0;

  matchedCameras.forEach((c) => {
    const level = c.floodInfo?.floodLevel || "LEVEL_0";
    if (level === "LEVEL_3") {
      maxFloodLevel = "LEVEL_3";
      floodedCount++;
    } else if (level === "LEVEL_2") {
      if (maxFloodLevel !== "LEVEL_3") maxFloodLevel = "LEVEL_2";
      floodedCount++;
    } else if (level === "LEVEL_1") {
      if (maxFloodLevel !== "LEVEL_3" && maxFloodLevel !== "LEVEL_2") {
        maxFloodLevel = "LEVEL_1";
      }
      floodedCount++;
    }
  });

  return {
    cameras: matchedCameras,
    hotspots: Array.from(foundHotspots),
    maxFloodLevel,
    floodedCount,
  };
}

/**
 * Full route planning and smart flood-avoidance engine.
 * Evaluates default route vs alternative routes and generates Mascot advice.
 */
export async function planSafeRoute(
  origin: SavedLocation,
  destination: SavedLocation,
  allCameras: CameraItem[],
  floodMap: Record<string, CameraFloodAnalysis>,
  mascotName = "Bé Vịt"
): Promise<RoutePlanResult> {
  const osrmRoutes = await fetchOsrmRoutes(
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng }
  );

  const analyzedRoutes: RouteAnalysis[] = osrmRoutes.map((rawRoute, idx) => {
    const scan = scanRouteCameras(rawRoute.geometry, allCameras, floodMap);
    return {
      id: `route-${idx}`,
      index: idx,
      name: rawRoute.name,
      distanceMeters: rawRoute.distance,
      durationSeconds: rawRoute.duration,
      geometry: rawRoute.geometry,
      cameras: scan.cameras,
      hotspots: scan.hotspots,
      maxFloodLevel: scan.maxFloodLevel,
      floodedCount: scan.floodedCount,
      isRecommended: false,
    };
  });

  let recommendedIdx = 0;
  let mascotQuote = "";

  const defaultRoute = analyzedRoutes[0];
  const isDefaultFlooded =
    defaultRoute.maxFloodLevel === "LEVEL_3" ||
    defaultRoute.maxFloodLevel === "LEVEL_2" ||
    (defaultRoute.maxFloodLevel === "LEVEL_1" && defaultRoute.hotspots.length > 0);

  // If default route is flooded, search for a drier alternative
  if (isDefaultFlooded && analyzedRoutes.length > 1) {
    let bestAltIdx = -1;
    let minFloodSeverity = Infinity;

    for (let i = 1; i < analyzedRoutes.length; i++) {
      const alt = analyzedRoutes[i];
      const severityScore =
        alt.maxFloodLevel === "LEVEL_3"
          ? 30
          : alt.maxFloodLevel === "LEVEL_2"
            ? 20
            : alt.maxFloodLevel === "LEVEL_1"
              ? 10
              : 0;

      if (severityScore < minFloodSeverity) {
        minFloodSeverity = severityScore;
        bestAltIdx = i;
      }
    }

    if (bestAltIdx > 0 && minFloodSeverity < 20) {
      recommendedIdx = bestAltIdx;
      const altRoute = analyzedRoutes[bestAltIdx];
      const diffKm = (
        (altRoute.distanceMeters - defaultRoute.distanceMeters) /
        1000
      ).toFixed(1);
      const diffDistStr = parseFloat(diffKm) > 0 ? `xa hơn ${diffKm}km` : "khoảng cách tương đương";

      // Find the worst flooded camera/road name on default route
      const worstCam = defaultRoute.cameras.find(
        (c) => c.floodInfo?.floodLevel === defaultRoute.maxFloodLevel
      );
      const badRoadName = worstCam?.camera.CamName || defaultRoute.hotspots[0]?.street || "Tuyến đường chính";
      const floodDepthText =
        defaultRoute.maxFloodLevel === "LEVEL_3"
          ? "trên 40cm"
          : defaultRoute.maxFloodLevel === "LEVEL_2"
            ? "khoảng 20 - 40cm"
            : "khoảng 15cm";

      mascotQuote = `"${badRoadName} đang ngập ${floodDepthText}, ${mascotName} gợi ý bạn đi vòng qua ${altRoute.name} ${diffDistStr} nhưng khô ráo!"`;
      altRoute.isRecommended = true;
      altRoute.recommendationReason = `Tuyến đường an toàn hơn (Ít ngập hơn tuyến chính)`;
    }
  }

  // If no alternative recommended or default is safe
  if (!mascotQuote) {
    defaultRoute.isRecommended = true;
    if (defaultRoute.maxFloodLevel === "LEVEL_0") {
      mascotQuote = `"${mascotName} đã kiểm tra: Toàn bộ lộ trình ${defaultRoute.name} hoàn toàn khô ráo, không ngập! Chúc bạn về nhà bình an nha!"`;
      defaultRoute.recommendationReason = "Lộ trình nhanh nhất và an toàn khô ráo";
    } else {
      mascotQuote = `"${mascotName} lưu ý: Lộ trình có ${defaultRoute.floodedCount} điểm đọng nước nhẹ. Hãy di chuyển cẩn thận và quan sát camera nha!"`;
      defaultRoute.recommendationReason = "Lộ trình khả dụng duy nhất";
    }
  }

  return {
    origin,
    destination,
    routes: analyzedRoutes,
    recommendedRouteIndex: recommendedIdx,
    mascotQuote,
  };
}
