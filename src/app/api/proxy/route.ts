import { NextRequest, NextResponse } from "next/server";
import { fetchCameraSnapshotRaw } from "@/lib/server-camera";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new NextResponse("Missing camera 'id' parameter", { status: 400 });
  }

  try {
    const result = await fetchCameraSnapshotRaw(id, 9000);

    if (!result || !result.buffer || result.buffer.byteLength === 0) {
      return returnPlaceholderSvg("Mất tín hiệu");
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      status: 200,
      headers: {
        "Content-Type": result.contentType || "image/jpeg",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    return returnPlaceholderSvg("Mất kết nối camera");
  }
}

function returnPlaceholderSvg(message: string) {
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" fill="#1e293b">
    <rect width="640" height="360" fill="#0f172a"/>
    <circle cx="320" cy="150" r="40" fill="#334155"/>
    <path d="M305 140 H335 V165 H305 Z" fill="#94a3b8"/>
    <circle cx="320" cy="152" r="6" fill="#0f172a"/>
    <text x="320" y="225" fill="#94a3b8" font-family="sans-serif" font-size="16" text-anchor="middle" font-weight="500">
      ${message}
    </text>
    <text x="320" y="250" fill="#64748b" font-family="sans-serif" font-size="12" text-anchor="middle">
      Đang thử kết nối lại...
    </text>
  </svg>
  `;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
