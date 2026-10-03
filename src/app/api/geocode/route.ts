import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface GeocodeItem {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

// Built-in curated popular landmarks in Ho Chi Minh City
const POPULAR_HCMC_LANDMARKS: GeocodeItem[] = [
  {
    name: "Tòa nhà Bitexco / Phố đi bộ Nguyễn Huệ",
    address: "Hải Triều, Bến Nghé, Quận 1, TP.HCM",
    lat: 10.7716,
    lng: 106.7044,
  },
  {
    name: "Landmark 81 (Vinhomes Central Park)",
    address: "720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM",
    lat: 10.7951,
    lng: 106.7218,
  },
  {
    name: "Chợ Bến Thành",
    address: "Đường Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM",
    lat: 10.7725,
    lng: 106.698,
  },
  {
    name: "Sân bay Quốc tế Tân Sơn Nhất",
    address: "Đường Trường Sơn, Phường 2, Tân Bình, TP.HCM",
    lat: 10.8184,
    lng: 106.6588,
  },
  {
    name: "Ngã tư Hàng Xanh",
    address: "Điện Biên Phủ & Xô Viết Nghệ Tĩnh, Bình Thạnh, TP.HCM",
    lat: 10.8016,
    lng: 106.7115,
  },
  {
    name: "Khu Công Nghệ Cao (SHTP)",
    address: "Xa Lộ Hà Nội, Tăng Nhơn Phú B, TP. Thủ Đức, TP.HCM",
    lat: 10.8542,
    lng: 106.7865,
  },
  {
    name: "Crescent Mall / Hồ Bán Nguyệt",
    address: "101 Tôn Dật Tiên, Tân Phú, Quận 7, TP.HCM",
    lat: 10.7294,
    lng: 106.7219,
  },
  {
    name: "Trần Xuân Soạn (Bờ Kênh Tẻ)",
    address: "Đường Trần Xuân Soạn, Tân Kiểng, Quận 7, TP.HCM",
    lat: 10.7558,
    lng: 106.7112,
  },
  {
    name: "Chợ Thủ Đức (Võ Văn Ngân)",
    address: "Võ Văn Ngân, Linh Chiểu, TP. Thủ Đức, TP.HCM",
    lat: 10.8498,
    lng: 106.7537,
  },
  {
    name: "Quang Trung & Phan Huy Ích (Gò Vấp)",
    address: "Phan Huy Ích, Phường 14, Gò Vấp, TP.HCM",
    lat: 10.8351,
    lng: 106.6575,
  },
  {
    name: "Bến xe Miền Đông mới",
    address: "Quốc lộ 1A, Phường Long Bình, TP. Thủ Đức, TP.HCM",
    lat: 10.8845,
    lng: 106.8122,
  },
  {
    name: "Bến xe Miền Tây",
    address: "395 Kinh Dương Vương, An Lạc, Bình Tân, TP.HCM",
    lat: 10.7412,
    lng: 106.6171,
  },
  {
    name: "Ga Sài Gòn",
    address: "1 Nguyễn Thông, Phường 9, Quận 3, TP.HCM",
    lat: 10.7828,
    lng: 106.6775,
  },
  {
    name: "Đại học Bách Khoa TP.HCM (Lý Thường Kiệt)",
    address: "268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM",
    lat: 10.7721,
    lng: 106.6579,
  },
  {
    name: "Đại học Quốc gia TP.HCM (Khu đô thị ĐHQG)",
    address: "Linh Trung, TP. Thủ Đức, TP.HCM",
    lat: 10.8751,
    lng: 106.8007,
  },
  {
    name: "Cầu Sài Gòn",
    address: "Xô Viết Nghệ Tĩnh / Xa Lộ Hà Nội, Bình Thạnh - TP. Thủ Đức",
    lat: 10.7997,
    lng: 106.7242,
  },
  {
    name: "Cầu Thủ Thiêm (Thủ Thiêm 1)",
    address: "Nguyễn Cơ Thạch / Ngô Tất Tố, Bình Thạnh - TP. Thủ Đức",
    lat: 10.7876,
    lng: 106.7198,
  },
  {
    name: "Phan Văn Đồng & Phan Văn Trị",
    address: "Phạm Văn Đồng, Phường 11, Bình Thạnh, TP.HCM",
    lat: 10.8228,
    lng: 106.6961,
  },
  {
    name: "Nguyễn Hữu Cảnh (Tòa nhà The Manor)",
    address: "91 Nguyễn Hữu Cảnh, Phường 22, Bình Thạnh, TP.HCM",
    lat: 10.7892,
    lng: 106.7153,
  },
];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim();

    if (!query) {
      return NextResponse.json(POPULAR_HCMC_LANDMARKS.slice(0, 8));
    }

    const lowerQ = query.toLowerCase();

    // 1. Check local predefined landmarks first (instant match)
    const localMatches = POPULAR_HCMC_LANDMARKS.filter(
      (item) =>
        item.name.toLowerCase().includes(lowerQ) ||
        item.address.toLowerCase().includes(lowerQ)
    );

    // 2. If Google Maps API Key is configured, use Google Geocoding API
    const googleKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (googleKey) {
      try {
        const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          query + ", Hồ Chí Minh, Việt Nam"
        )}&components=country:VN&bounds=10.35,106.35|11.15,107.05&key=${googleKey}&language=vi`;

        const gRes = await fetch(gUrl, { next: { revalidate: 3600 } });
        if (gRes.ok) {
          const gData = await gRes.json();
          if (gData.status === "OK" && gData.results?.length > 0) {
            const googleResults: GeocodeItem[] = gData.results.map((r: any) => ({
              name: r.formatted_address.split(",")[0] || query,
              address: r.formatted_address,
              lat: r.geometry.location.lat,
              lng: r.geometry.location.lng,
            }));

            // Merge local and google results
            const combined = [...localMatches, ...googleResults];
            const deduped = combined.filter(
              (item, idx, self) =>
                idx ===
                self.findIndex(
                  (t) =>
                    Math.abs(t.lat - item.lat) < 0.001 &&
                    Math.abs(t.lng - item.lng) < 0.001
                )
            );
            return NextResponse.json(deduped.slice(0, 8));
          }
        }
      } catch (gErr) {
        console.warn("[Geocode API] Google Geocoding failed:", gErr);
      }
    }

    // 3. Fallback: OpenStreetMap Nominatim Free Geocoder (Scoped to TP.HCM)
    try {
      const searchTerms = `${query}, TP.HCM, Việt Nam`;
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        searchTerms
      )}&format=json&addressdetails=1&limit=6&countrycodes=vn&viewbox=106.35,11.15,107.05,10.35`;

      const nomRes = await fetch(nomUrl, {
        headers: {
          "User-Agent": "VenHa-Traffic-Flood-App/1.0",
          "Accept-Language": "vi,en;q=0.9",
        },
        next: { revalidate: 3600 },
      });

      if (nomRes.ok) {
        const nomData = await nomRes.json();
        const nomResults: GeocodeItem[] = (nomData || []).map((item: any) => {
          const shortName = item.display_name.split(",")[0] || query;
          return {
            name: shortName,
            address: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          };
        });

        const combined = [...localMatches, ...nomResults];
        const deduped = combined.filter(
          (item, idx, self) =>
            idx ===
            self.findIndex(
              (t) =>
                Math.abs(t.lat - item.lat) < 0.001 &&
                Math.abs(t.lng - item.lng) < 0.001
            )
        );

        return NextResponse.json(deduped.slice(0, 8));
      }
    } catch (nomErr) {
      console.warn("[Geocode API] Nominatim geocode failed:", nomErr);
    }

    return NextResponse.json(localMatches.slice(0, 8));
  } catch (err: any) {
    console.error("[Geocode API] Global error:", err);
    return NextResponse.json([], { status: 500 });
  }
}
