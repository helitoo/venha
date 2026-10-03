import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CameraFloodAnalysis } from "@/types/camera";

let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (supabaseClient) return supabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      supabaseClient = createClient(url, key, {
        auth: { persistSession: false },
      });
    } catch (err) {
      console.warn("[Supabase] Failed to initialize client:", err);
    }
  }

  return supabaseClient;
}

export interface SupabaseFloodRecord {
  cam_id: string;
  flood_level: string;
  is_raining: boolean;
  rain_intensity: string;
  road_condition: string;
  traffic_density: string;
  traffic_speed: string;
  description: string;
  image_hash?: string;
  lat?: number;
  lng?: number;
  analyzed_at: number;
}

import { GEMINI_FLOOD_TTL_MINUTES } from "@/config/constants";

/**
 * Fetch cached flood analysis from Supabase by CamId
 * Checks both analyzed_at (bigint ms) and updated_at (timestamptz) against 20m TTL
 */
export async function getFloodFromSupabase(
  camId: string,
  ttlMinutes = GEMINI_FLOOD_TTL_MINUTES
): Promise<CameraFloodAnalysis | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from("camera_flood_cache")
      .select("*")
      .eq("cam_id", camId)
      .single();

    if (error || !data) return null;

    // Check TTL against analyzed_at or updated_at
    const analyzedTime =
      typeof data.analyzed_at === "number" && data.analyzed_at > 0
        ? data.analyzed_at
        : data.updated_at
        ? new Date(data.updated_at).getTime()
        : 0;

    const now = Date.now();
    if (analyzedTime === 0 || now - analyzedTime > ttlMinutes * 60 * 1000) {
      // Record is stale (> 20 mins)
      return null;
    }

    return {
      camId: data.cam_id,
      floodLevel: data.flood_level,
      isRaining: data.is_raining,
      rainIntensity: data.rain_intensity,
      roadCondition: data.road_condition,
      trafficDensity: data.traffic_density,
      trafficSpeed: data.traffic_speed,
      description: data.description,
      analyzedAt: analyzedTime,
    };
  } catch (err) {
    console.warn(`[Supabase] Read cache error for ${camId}:`, err);
    return null;
  }
}

/**
 * Save / UPSERT flood analysis into Supabase
 */
export async function upsertFloodToSupabase(
  record: SupabaseFloodRecord
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase.from("camera_flood_cache").upsert(
      {
        cam_id: record.cam_id,
        flood_level: record.flood_level,
        is_raining: record.is_raining,
        rain_intensity: record.rain_intensity,
        road_condition: record.road_condition,
        traffic_density: record.traffic_density,
        traffic_speed: record.traffic_speed,
        description: record.description,
        image_hash: record.image_hash,
        lat: record.lat,
        lng: record.lng,
        analyzed_at: record.analyzed_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cam_id" }
    );

    return !error;
  } catch (err) {
    console.warn(`[Supabase] Upsert error for ${record.cam_id}:`, err);
    return false;
  }
}

/**
 * Batch UPSERT multiple flood analyses into Supabase in chunks of 100
 */
export async function upsertBatchFloodToSupabase(
  records: SupabaseFloodRecord[]
): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase || !records || records.length === 0) return false;

  try {
    const nowIso = new Date().toISOString();
    const rows = records.map((r) => ({
      cam_id: r.cam_id,
      flood_level: r.flood_level,
      is_raining: Boolean(r.is_raining),
      rain_intensity: r.rain_intensity || "none",
      road_condition: r.road_condition || "dry",
      traffic_density: r.traffic_density || "moderate",
      traffic_speed: r.traffic_speed || "normal",
      description: r.description || "",
      image_hash: r.image_hash,
      lat: r.lat,
      lng: r.lng,
      analyzed_at: r.analyzed_at,
      updated_at: nowIso,
    }));

    // Chunk by 100 to stay within payload limits
    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const { error } = await supabase
        .from("camera_flood_cache")
        .upsert(chunk, { onConflict: "cam_id" });

      if (error) {
        console.warn("[Supabase] Batch upsert chunk error:", error);
      }
    }

    return true;
  } catch (err) {
    console.warn("[Supabase] Batch upsert error:", err);
    return false;
  }
}
