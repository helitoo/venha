/**
 * Core Application Constants & Configuration
 * Hardcoded by default to prevent deployment downtime and environment variable dependencies.
 */

// Thời gian tự động làm mới / re-fetch hình ảnh camera (tính theo giây)
export const CAMERA_REFRESH_INTERVAL_SEC = 30;

// Chu kỳ tự động kiểm tra thời tiết Open-Meteo & phân tích ngập lụt AI (tính theo giây)
export const FLOOD_SCAN_INTERVAL_SEC = 60;

// Thời gian lưu giữ kết quả phân tích AI trước khi quét lại (TTL 20 phút)
export const GEMINI_FLOOD_TTL_MINUTES = 20;

// Bán kính gom cụm & lan tỏa Spatial Cache cho camera lân cận (km)
export const GEMINI_SPATIAL_CACHE_RADIUS_KM = 0.8;

// Bán kính gom cụm đại diện lấy mẫu thời tiết Open-Meteo (km)
export const WEATHER_SAMPLE_RADIUS_KM = 2.5;
