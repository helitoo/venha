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

/**
 * Fetch cached flood analysis from Supabase by CamId
 */
export async function getFloodFromSupabase(
  camId: string,
  ttlMinutes = 10
): Promise<CameraFloodAnalysis | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  try {
    const minTimestamp = Date.now() - ttlMinutes * 60 * 1000;
    const { data, error } = await supabase
      .from("camera_flood_cache")
      .select("*")
      .eq("cam_id", camId)
      .gte("analyzed_at", minTimestamp)
      .single();

    if (error || !data) return null;

    return {
      camId: data.cam_id,
      floodLevel: data.flood_level,
      isRaining: data.is_raining,
      rainIntensity: data.rain_intensity,
      roadCondition: data.road_condition,
      trafficDensity: data.traffic_density,
      trafficSpeed: data.traffic_speed,
      description: data.description,
      analyzedAt: data.analyzed_at,
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
