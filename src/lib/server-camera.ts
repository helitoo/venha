// Server-side camera client and snapshot fetcher
// Handles upstream authentication, negative caching, retry, and concurrency pooling.

let cachedCookieHeader = "";
let cookieExpiresAt = 0;
let isRefreshingCookie = false;

/**
 * Obtain fresh cookie header for the HCMC traffic camera system.
 */
export async function getFreshCookieHeader(): Promise<string> {
  const envCookie = process.env.CAMERA_COOKIE;
  if (envCookie) {
    return envCookie;
  }

  const now = Date.now();
  if (cachedCookieHeader && now < cookieExpiresAt - 120000) {
    return cachedCookieHeader;
  }

  if (isRefreshingCookie || now < cookieExpiresAt) {
    return cachedCookieHeader || "";
  }

  isRefreshingCookie = true;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const res = await fetch("https://giaothong.hochiminhcity.gov.vn/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    const setCookies = res.headers.getSetCookie
      ? res.headers.getSetCookie()
      : [res.headers.get("set-cookie") || ""];

    const compiled = setCookies
      .filter(Boolean)
      .map((c) => c.split(";")[0])
      .join("; ");

    if (compiled) {
      cachedCookieHeader = compiled;
      cookieExpiresAt = now + 10 * 60 * 1000; // 10 minutes cache
    } else {
      cookieExpiresAt = now + 3 * 60 * 1000; // 3 minutes backoff
    }
  } catch {
    cookieExpiresAt = now + 3 * 60 * 1000;
  } finally {
    isRefreshingCookie = false;
  }

  return cachedCookieHeader;
}

function buildHeaders(cookieVal: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,vi;q=0.8",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Referer: "http://giaothong.hochiminhcity.gov.vn/",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  };
  if (cookieVal) {
    headers["Cookie"] = cookieVal;
  }
  return headers;
}

/**
 * Fetch raw snapshot buffer from the camera gateway.
 */
export async function fetchCameraSnapshotRaw(
  camId: string,
  timeoutMs = 7000
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const targetUrl = `https://giaothong.hochiminhcity.gov.vn:8007/Render/CameraHandler.ashx?id=${encodeURIComponent(
    camId
  )}&${Date.now()}`;

  let cookie = await getFreshCookieHeader();

  try {
    let controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response = await fetch(targetUrl, {
      headers: buildHeaders(cookie),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    // If 403 Forbidden, force cookie refresh and retry once
    if (response.status === 403) {
      cachedCookieHeader = "";
      cookieExpiresAt = 0;
      cookie = await getFreshCookieHeader();

      controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      response = await fetch(targetUrl, {
        headers: buildHeaders(cookie),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength === 0) {
      return null;
    }

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch camera snapshot converted to base64 string for Gemini AI analysis.
 */
export async function fetchCameraSnapshotBase64(
  camId: string,
  timeoutMs = 7000
): Promise<string | null> {
  const result = await fetchCameraSnapshotRaw(camId, timeoutMs);
  if (!result || !result.buffer || result.buffer.length === 0) {
    return null;
  }
  return result.buffer.toString("base64");
}

/**
 * Concurrently fetch camera snapshots in batches with concurrency limit.
 */
export async function fetchBatchCameraSnapshots(
  camIds: string[],
  concurrency = 6,
  timeoutMs = 7000
): Promise<Array<{ camId: string; imageBase64: string | null }>> {
  if (camIds.length === 0) return [];

  const results: Array<{ camId: string; imageBase64: string | null }> = [];
  let index = 0;

  async function worker() {
    while (index < camIds.length) {
      const i = index++;
      const id = camIds[i];
      try {
        const base64 = await fetchCameraSnapshotBase64(id, timeoutMs);
        results[i] = { camId: id, imageBase64: base64 };
      } catch {
        results[i] = { camId: id, imageBase64: null };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, camIds.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
