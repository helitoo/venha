"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useMascotContext } from "@/context/MascotContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudLightning,
  Droplets,
  Wind,
  Gauge,
  Thermometer,
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  MapPin,
  Waves,
} from "lucide-react";

interface OpenMeteoData {
  temperature: number;
  apparentTemperature: number;
  relativeHumidity: number;
  precipitation: number;
  rain: number;
  windSpeed: number;
  surfacePressure: number;
  weatherCode: number;
  rainProbability?: number;
}

export function getWmoWeatherInfo(code: number): {
  label: string;
  category: "sun" | "cloud" | "rain" | "storm";
} {
  if (code === 0) return { label: "Trời quang đãng, nắng đẹp", category: "sun" };
  if (code === 1 || code === 2)
    return { label: "Có mây, nắng dịu", category: "sun" };
  if (code === 3) return { label: "Trời nhiều mây, râm mát", category: "cloud" };
  if (code === 45 || code === 48)
    return { label: "Sương mù nhẹ", category: "cloud" };
  if (code === 51 || code === 53 || code === 55)
    return { label: "Mưa phùn lất phất", category: "rain" };
  if (code === 61 || code === 63 || code === 65)
    return { label: "Mưa rào", category: "rain" };
  if (code === 80 || code === 81 || code === 82)
    return { label: "Mưa to, mưa rào nặng hạt", category: "rain" };
  if (code === 95 || code === 96 || code === 99)
    return { label: "Giông bão, có sấm sét", category: "storm" };
  return { label: "Thời tiết ổn định", category: "sun" };
}

export default function CameraWeatherCard() {
  const { mascotType, getMascotImage } = useMascotContext();
  const {
    severeFloodCount,
    moderateFloodCount,
    minorFloodCount,
    rainyCameraIds,
  } = useWeatherFloodContext();

  const [isOpen, setIsOpen] = useState(false);
  const [weatherData, setWeatherData] = useState<OpenMeteoData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [hasError, setHasError] = useState<boolean>(false);

  // TP. Hồ Chí Minh Center Coordinate (10.7769, 106.7009)
  const targetLat = 10.7769;
  const targetLng = 106.7009;

  // Fetch Open-Meteo Data directly on client (free, CORS supported)
  const fetchOpenMeteo = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${targetLat.toFixed(5)}&longitude=${targetLng.toFixed(5)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m,surface_pressure&hourly=precipitation_probability&forecast_days=1&timezone=auto`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch Open-Meteo weather");

      const data = await res.json();
      const current = data.current || {};
      const currentHour = new Date().getHours();
      const rainProb = data.hourly?.precipitation_probability?.[currentHour] ?? 0;

      setWeatherData({
        temperature: Math.round((current.temperature_2m ?? 30) * 10) / 10,
        apparentTemperature:
          Math.round((current.apparent_temperature ?? 32) * 10) / 10,
        relativeHumidity: Math.round(current.relative_humidity_2m ?? 75),
        precipitation: current.precipitation ?? 0,
        rain: current.rain ?? 0,
        windSpeed: Math.round((current.wind_speed_10m ?? 8) * 10) / 10,
        surfacePressure: Math.round(current.surface_pressure ?? 1010),
        weatherCode: current.weather_code ?? 0,
        rainProbability: rainProb,
      });
    } catch (err) {
      console.warn("[CameraWeatherCard] Open-Meteo error:", err);
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [targetLat, targetLng]);

  useEffect(() => {
    fetchOpenMeteo();
  }, [fetchOpenMeteo]);

  const wmo = getWmoWeatherInfo(weatherData?.weatherCode ?? 0);
  const mascotImg = getMascotImage(
    severeFloodCount > 0 ? "flood" : rainyCameraIds.length > 0 ? "rain" : "sunny"
  );

  // Dynamic Mascot Weather Commentary for TP.HCM
  let mascotSpeech = "Khu vực TP.HCM hôm nay khô ráo, gió mát, đường thông hè thoáng bạn nha!";
  if (severeFloodCount > 0) {
    mascotSpeech =
      mascotType === "duck"
        ? `Đang có ${severeFloodCount} tuyến đường ngập sâu trên 40cm! Bạn đi cẩn thận thật nhiều nhé 🦆🚨`
        : `Ngập sâu meow! Toàn thành phố có ${severeFloodCount} điểm ngập nặng, mở bản đồ kiểm tra kỹ trước khi đi nha sen! 🐱🌊`;
  } else if (moderateFloodCount > 0) {
    mascotSpeech =
      mascotType === "duck"
        ? `Có ${moderateFloodCount} tuyến đường ngập vừa nửa bánh xe! Đi chậm giữ đều tay ga nha 🦆⚠️`
        : `Đang có điểm ngập vừa meow! Nhớ theo dõi camera trên đường về nhà nha sen! 🐱🛵`;
  } else if (minorFloodCount > 0) {
    mascotSpeech =
      mascotType === "duck"
        ? "Một vài tuyến đường ngập nhẹ mép vỉa hè! Chạy xe cẩn thận tránh té nước nha 🦆⚠️"
        : "Vài nơi nước mấp mé mép đường meow! Đi chậm kẻo văng ướt đồ nha sen 🐱💦";
  } else if (weatherData && (weatherData.precipitation > 0 || weatherData.rain > 0)) {
    mascotSpeech =
      mascotType === "duck"
        ? `Trời đang mưa ${weatherData.precipitation}mm/h! Nhớ mặc áo mưa và bật đèn xe nha 🦆🌧️`
        : `Mưa rơi ướt đường rồi meow! Chạy chậm kẻo trơn trượt nhé sen 🐱☔`;
  } else if (weatherData && weatherData.temperature >= 34) {
    mascotSpeech =
      mascotType === "duck"
        ? `Nhiệt độ ${weatherData.temperature}°C nắng gắt, nhớ uống nhiều nước nha bạn ơi 🦆☀️`
        : `Nắng nóng quá meow! Kiếm chỗ râm mát chạy xe cẩn thận nha sen 🐱🧊`;
  }

  // 1. COLLAPSED MINI PILL BUTTON (BOTTOM-RIGHT)
  if (!isOpen) {
    return (
      <div className="absolute bottom-3 right-3 sm:bottom-6 sm:right-4 z-[990] font-sans pointer-events-auto">
        <button
          onClick={() => setIsOpen(true)}
          title="Nhấn để mở Dự Báo Thời Tiết & Triều Cường TP.HCM"
          className="group flex items-center gap-2 sm:gap-2.5 px-2.5 py-2 sm:px-3.5 sm:py-2.5 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200 dark:border-slate-800 shadow-2xl hover:shadow-cyan-500/10 hover:border-cyan-500/40 transition-all duration-300 active:scale-95 text-slate-800 dark:text-slate-100"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-cyan-500/10 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center shrink-0">
            {wmo.category === "rain" || (weatherData && weatherData.precipitation > 0) ? (
              <CloudRain className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-cyan-500 animate-pulse" />
            ) : wmo.category === "storm" ? (
              <CloudLightning className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-500 animate-bounce" />
            ) : (
              <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500 animate-spin-slow" />
            )}
          </div>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="text-[11px] sm:text-xs font-bold leading-tight">
                Dự báo TP.HCM
              </span>
              <span className="text-[11px] sm:text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400">
                {weatherData ? `${weatherData.temperature}°C` : "--°C"}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mt-0.5">
              <span className="truncate max-w-[85px] sm:max-w-[110px]">{wmo.label.split(",")[0]}</span>
              <span>•</span>
              <span className="text-blue-600 dark:text-blue-400 font-semibold group-hover:underline flex items-center">
                Mở <ChevronUp className="w-3 h-3 ml-0.5 inline-block" />
              </span>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // 2. EXPANDED TP.HCM WEATHER FORECAST CARD
  return (
    <>
      {/* Mobile Backdrop to click-outside-to-close */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs sm:hidden z-[995] pointer-events-auto"
        onClick={() => setIsOpen(false)}
      />

      <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-6 z-[1000] w-auto sm:w-[380px] max-h-[82vh] overflow-y-auto bg-white/98 dark:bg-slate-900/98 backdrop-blur-2xl border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300 font-sans pointer-events-auto">
        {/* Header */}
        <div className="p-3.5 sm:p-4 pb-2 border-b border-slate-200/80 dark:border-slate-800 flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              <Thermometer className="w-3.5 h-3.5" />
              <span>Dự Báo Khí Tượng & Ngập Lụt</span>
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
              TP. Hồ Chí Minh
            </h3>
            <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
              <span className="truncate">Toàn thành phố • Giám sát mưa & triều cường</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsOpen(false)}
              title="Thu gọn bảng dự báo thời tiết"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

      {/* Mascot Commentary Speech Bubble */}
      <div className="px-4 py-2.5 bg-blue-50/50 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-800 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 shrink-0 shadow-sm overflow-hidden flex items-center justify-center">
          <img
            src={mascotImg}
            alt={mascotType === "duck" ? "Bé Vịt" : "Bé Mèo"}
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">
            <span>{mascotType === "duck" ? "🦆 Bé Vịt" : "🐱 Bé Mèo"} nhắc nhở TP.HCM:</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-200 italic font-medium leading-snug line-clamp-2 mt-0.5">
            &ldquo;{mascotSpeech}&rdquo;
          </p>
        </div>
      </div>

      {/* Main Weather Metrics */}
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="py-6 flex flex-col items-center justify-center text-slate-400 text-xs">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500 mb-2" />
            <span>Đang nạp dữ liệu khí tượng Open-Meteo...</span>
          </div>
        ) : hasError ? (
          <div className="py-4 text-center text-xs text-rose-500">
            Không thể tải dữ liệu thời tiết. Vui lòng bấm thử lại.
          </div>
        ) : (
          <>
            {/* Temperature & WMO Icon */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 dark:bg-amber-400/10 text-amber-500 shrink-0">
                  {wmo.category === "sun" ? (
                    <Sun className="w-7 h-7" />
                  ) : wmo.category === "cloud" ? (
                    <Cloud className="w-7 h-7 text-slate-400" />
                  ) : wmo.category === "storm" ? (
                    <CloudLightning className="w-7 h-7 text-purple-500" />
                  ) : (
                    <CloudRain className="w-7 h-7 text-cyan-500" />
                  )}
                </div>
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 font-mono">
                      {weatherData?.temperature ?? 30}°C
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      (Cảm giác như {weatherData?.apparentTemperature ?? 32}°C)
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5">
                    {wmo.label}
                  </div>
                </div>
              </div>

              {/* Rain Probability Badge */}
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-medium">Xác suất mưa</div>
                <div className="text-sm font-bold text-cyan-600 dark:text-cyan-400 font-mono">
                  {weatherData?.rainProbability ?? 20}%
                </div>
              </div>
            </div>

            {/* Weather Detail Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
                <Droplets className="w-4 h-4 text-blue-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-medium">Độ ẩm</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {weatherData?.relativeHumidity ?? 75}%
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
                <CloudRain className="w-4 h-4 text-cyan-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-medium">Lượng mưa</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {weatherData?.precipitation ?? 0} mm/h
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
                <Wind className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-medium">Tốc độ gió</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {weatherData?.windSpeed ?? 8} km/h
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center gap-2">
                <Gauge className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-400 font-medium">Áp suất</div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {weatherData?.surfacePressure ?? 1010} hPa
                  </div>
                </div>
              </div>
            </div>

            {/* Citywide Flood & Rain Statistics Overview */}
            <div className="p-3 rounded-2xl bg-gradient-to-r from-slate-50 to-cyan-50/50 dark:from-slate-800/50 dark:to-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex flex-col gap-1.5 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                <span className="flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  Toàn thành phố:
                </span>
                <span className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">
                  {severeFloodCount + moderateFloodCount + minorFloodCount} điểm có nước
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  Ngập nặng: <b>{severeFloodCount}</b>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  Ngập vừa: <b>{moderateFloodCount}</b>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  Đang mưa: <b>{rainyCameraIds.length}</b>
                </span>
              </div>
            </div>
          </>
        )}

        {/* Footer Actions */}
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => fetchOpenMeteo()}
            disabled={isLoading}
            className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition flex items-center justify-center gap-1.5 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            <span>Làm mới dự báo</span>
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-xs transition flex items-center justify-center gap-1"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Thu gọn</span>
          </button>
        </div>
      </div>
    </div>
    </>
  );
}
