import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import dotenv from "dotenv";

// Read .env.local
const envConfig = dotenv.parse(fs.readFileSync(".env.local"));

const url = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const key = envConfig.SUPABASE_SERVICE_ROLE_KEY || envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("Connecting to Supabase at:", url);
const supabase = createClient(url, key);

async function test() {
  const testRecord = {
    cam_id: "test-cam-1",
    flood_level: "LEVEL_0",
    is_raining: false,
    rain_intensity: "none",
    road_condition: "dry",
    traffic_density: "moderate",
    traffic_speed: "normal",
    description: "Đường khô ráo thông thoáng",
    analyzed_at: Date.now(),
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from("camera_flood_cache").upsert(testRecord, { onConflict: "cam_id" }).select();
  console.log("Upsert result:", { data, error });

  const { data: readData, error: readErr } = await supabase.from("camera_flood_cache").select("*").limit(5);
  console.log("Read result:", { readData, readErr });
}

test();
