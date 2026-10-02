import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Global in-memory cookie cache
let cachedCookieHeader = "";
let cookieExpiresAt = 0;
let isRefreshingCookie = false;

async function getFreshCookieHeader(): Promise<string> {
  const now = Date.now();
  // Return cached cookie if valid for at least another 2 minutes
  if (cachedCookieHeader && now < cookieExpiresAt - 120000) {
    return cachedCookieHeader;
  }

  if (isRefreshingCookie) {
    return cachedCookieHeader || "";
  }

  isRefreshingCookie = true;
  try {
    const res = await fetch("https://giaothong.hochiminhcity.gov.vn/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });

    const setCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];

    const compiled = setCookies
      .filter(Boolean)
      .map((c) => c.split(";")[0])
      .join("; ");

    if (compiled) {
      cachedCookieHeader = compiled;
      // Cache cookie for 10 minutes
      cookieExpiresAt = now + 10 * 60 * 1000;
    }
  } catch (err) {
    console.warn("Failed to fetch fresh session cookies:", err);
  } finally {
    isRefreshingCookie = false;
  }

  return cachedCookieHeader;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  let targetUrl = searchParams.get("url");

  if (!id && !targetUrl) {
    return new NextResponse("Missing camera 'id' or 'url' parameter", { status: 400 });
  }

  if (!targetUrl && id) {
    const timestamp = searchParams.get("t") || Date.now().toString();
    targetUrl = `https://giaothong.hochiminhcity.gov.vn:8007/Render/CameraHandler.ashx?id=${id}&${timestamp}`;
  }

  let cookie = await getFreshCookieHeader();

  const fetchHeaders = (cookieVal: string): Record<string, string> => ({
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "http://giaothong.hochiminhcity.gov.vn/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    Cookie: cookieVal,
  });

  try {
    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 9000);

    let response = await fetch(targetUrl!, {
      headers: fetchHeaders(cookie),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    // If 403 Forbidden, force cookie refresh and retry once immediately
    if (response.status === 403) {
      cachedCookieHeader = "";
      cookieExpiresAt = 0;
      cookie = await getFreshCookieHeader();

      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 9000);

      response = await fetch(targetUrl!, {
        headers: fetchHeaders(cookie),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return returnPlaceholderSvg(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    // If empty buffer returned
    if (arrayBuffer.byteLength === 0) {
      return returnPlaceholderSvg("Mất tín hiệu");
    }

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
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
