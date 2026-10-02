import { NextRequest, NextResponse } from "next/server";
import { getAllCameras, getDistricts } from "@/lib/cameras";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const district = searchParams.get("district");
  const query = searchParams.get("q")?.toLowerCase();
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "12", 10);

  let cameras = getAllCameras();

  if (district && district !== "all") {
    cameras = cameras.filter(
      (c) => (c.District || c.Disctrict || "").toLowerCase() === district.toLowerCase()
    );
  }

  if (query) {
    cameras = cameras.filter(
      (c) =>
        c.CamName.toLowerCase().includes(query) ||
        (c.District && c.District.toLowerCase().includes(query))
    );
  }

  const total = cameras.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const paginatedCameras = cameras.slice(startIndex, startIndex + limit);

  return NextResponse.json({
    data: paginatedCameras,
    pagination: {
      page,
      limit,
      total,
      totalPages,
    },
    districts: getDistricts(),
  });
}
