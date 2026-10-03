-- ==============================================================================
-- BẢNG LƯU TRỮ CACHE PHÂN TÍCH NGẬP LỤT & THỜI TIẾT TẬP TRUNG (SUPABASE)
-- Cơ chế: Ghi đè (UPSERT) theo cam_id để dung lượng toàn bộ 500 camera luôn < 1MB
-- ==============================================================================

-- 1. Tạo bảng camera_flood_cache
CREATE TABLE IF NOT EXISTS camera_flood_cache (
  cam_id TEXT PRIMARY KEY,                       -- Khóa chính: mỗi camera chỉ tốn 1 dòng
  flood_level TEXT NOT NULL,                     -- LEVEL_0, LEVEL_1, LEVEL_2, LEVEL_3, UNCLEAR
  is_raining BOOLEAN DEFAULT FALSE,              -- true/false
  rain_intensity TEXT DEFAULT 'none',            -- none, light, moderate, heavy
  road_condition TEXT DEFAULT 'dry',             -- dry, wet, flooded
  traffic_density TEXT DEFAULT 'moderate',       -- low, moderate, high, jam
  traffic_speed TEXT DEFAULT 'normal',           -- fast, normal, slow, standstill
  description TEXT,                              -- Câu mô tả trạng thái tiếng Việt chuẩn
  image_hash TEXT,                               -- Hash MD5 của ảnh gần nhất để chống quét trùng
  lat DOUBLE PRECISION,                          -- Tọa độ vĩ độ
  lng DOUBLE PRECISION,                          -- Tọa độ kinh độ
  analyzed_at BIGINT NOT NULL,                   -- Timestamp mili-giây thời điểm quét AI
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Đánh chỉ mục Index để truy vấn tức thì theo vị trí & thời gian
CREATE INDEX IF NOT EXISTS idx_camera_flood_coords ON camera_flood_cache (lat, lng);
CREATE INDEX IF NOT EXISTS idx_camera_flood_analyzed_at ON camera_flood_cache (analyzed_at);

-- 3. Bật Row Level Security (RLS)
ALTER TABLE camera_flood_cache ENABLE ROW LEVEL SECURITY;

-- 4. Cho phép mọi người (Public / Anon) ĐỌC dữ liệu tự do
CREATE POLICY "Cho phép đọc cache công khai"
  ON camera_flood_cache
  FOR SELECT
  USING (true);

-- 5. Cho phép Service Role & Anon ghi đè cache (UPSERT)
CREATE POLICY "Cho phép ghi đè cache"
  ON camera_flood_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
