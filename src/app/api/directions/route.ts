import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const originLat = parseFloat(searchParams.get("originLat") || "");
    const originLng = parseFloat(searchParams.get("originLng") || "");
    const destLat = parseFloat(searchParams.get("destLat") || "");
    const destLng = parseFloat(searchParams.get("destLng") || "");

    if (
      isNaN(originLat) ||
      isNaN(originLng) ||
      isNaN(destLat) ||
      isNaN(destLng)
    ) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }

    const googleKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    // 1. Try Google Directions API if key configured
    if (googleKey) {
      try {
        const gUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&alternatives=true&mode=driving&language=vi&key=${googleKey}`;
        const gRes = await fetch(gUrl);
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === "OK" && gData.routes?.length > 0) {
            const routes = gData.routes.map((r: any, idx: number) => {
              const geometry = decodePolyline(r.overview_polyline?.points || "");
              const leg = r.legs?.[0] || {};
              return {
                geometry,
                distance: leg.distance?.value || 0,
                duration: leg.duration?.value || 0,
                name: r.summary || `Lộ trình Google ${idx + 1}`,
              };
            });
            return NextResponse.json({ source: "google", routes });
          }
        }
      } catch (gErr) {
        console.warn("[Directions API] Google Directions failed, falling back to OSRM:", gErr);
      }
    }

    // 2. Fallback to OSRM Driving Directions
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=true&steps=true`;
    const res = await fetch(osrmUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const data = await res.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error(data.message || "No routes found");
    }

    const routes = data.routes.map((r: any, idx: number) => {
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

    return NextResponse.json({ source: "osrm", routes });
  } catch (err: any) {
    console.error("[Directions API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
