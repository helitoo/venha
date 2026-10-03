"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { MascotMood, MascotType, UserSavedLocation } from "@/types/mascot";
import { MASCOT_IMAGE_MAP, pickDynamicQuote } from "@/data/mascotQuotes";
import { useCameraContext } from "@/context/CameraContext";
import { useWeatherFloodContext } from "@/context/WeatherFloodContext";
import { CameraItem } from "@/types/camera";

interface MascotContextType {
  mascotType: MascotType;
  setMascotType: (type: MascotType) => void;
  toggleMascotType: () => void;
  userLocation: { lat: number; lng: number } | null;
  saveUserLocation: (lat: number, lng: number) => void;
  mascotMood: MascotMood;
  currentQuote: string;
  cycleNextQuote: () => void;
  getMascotImage: (mood?: MascotMood, type?: MascotType) => string;
  getMoodForCamera: (cam: CameraItem) => MascotMood;
  isInitialRainActive: boolean;
  dismissInitialRain: () => void;
  isSpeechBubbleOpen: boolean;
  setIsSpeechBubbleOpen: (open: boolean) => void;
  setCustomSpeechQuote: (quote: string) => void;
}

const MascotContext = createContext<MascotContextType | null>(null);

const STORAGE_KEY_MASCOT = "venha_mascot_type";
const STORAGE_KEY_LOCATION = "venha_user_location";

export function MascotProvider({ children }: { children: React.ReactNode }) {
  const { allCameras } = useCameraContext();
  const { weatherMap, floodMap, rainyCameraIds, severeFloodCount, moderateFloodCount } =
    useWeatherFloodContext();

  // 1. Mascot selection (Default: "duck", persisted in localStorage)
  const [mascotType, setMascotTypeState] = useState<MascotType>("duck");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MASCOT);
      if (saved === "cat" || saved === "duck") {
        setMascotTypeState(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  const setMascotType = useCallback((type: MascotType) => {
    setMascotTypeState(type);
    try {
      localStorage.setItem(STORAGE_KEY_MASCOT, type);
    } catch {
      // ignore
    }
  }, []);

  const toggleMascotType = useCallback(() => {
    setMascotTypeState((prev) => {
      const next: MascotType = prev === "duck" ? "cat" : "duck";
      try {
        localStorage.setItem(STORAGE_KEY_MASCOT, next);
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // 2. User Location persistence
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LOCATION);
      if (saved) {
        const parsed: UserSavedLocation = JSON.parse(saved);
        if (typeof parsed.lat === "number" && typeof parsed.lng === "number") {
          setUserLocation({ lat: parsed.lat, lng: parsed.lng });
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const saveUserLocation = useCallback((lat: number, lng: number) => {
    setUserLocation({ lat, lng });
    try {
      const data: UserSavedLocation = { lat, lng, updatedAt: Date.now() };
      localStorage.setItem(STORAGE_KEY_LOCATION, JSON.stringify(data));
    } catch {
      // ignore
    }
  }, []);

  // 3. Compute Mascot Mood for any camera
  const getMoodForCamera = useCallback(
    (cam: CameraItem): MascotMood => {
      const flood = floodMap[cam.CamId];
      const weather = weatherMap[cam.CamId];
      const currentHour = new Date().getHours();

      // Severe flood always alerts first
      if (flood && (flood.floodLevel === "LEVEL_3" || flood.floodLevel === "LEVEL_2")) {
        return "flood";
      }

      // Late night sleep time (22h00 - 05h00)
      if (currentHour >= 22 || currentHour < 5) {
        return "sleep";
      }

      if (
        (flood && flood.floodLevel === "LEVEL_1") ||
        (weather &&
          (weather.category === "cloud-rain" ||
            weather.category === "droplet" ||
            weather.category === "tornado" ||
            (weather.precipitation !== undefined && weather.precipitation > 0.05) ||
            (weather.rain !== undefined && weather.rain > 0)))
      ) {
        return "rain";
      }

      return "sunny";
    },
    [floodMap, weatherMap]
  );

  // 4. Compute current Mascot Mood based on User Location (or General City Forecast)
  const mascotMood: MascotMood = useMemo(() => {
    const currentHour = new Date().getHours();

    // If user has location, find closest camera
    if (userLocation && allCameras.length > 0) {
      let closestCam: CameraItem | null = null;
      let minDistanceSq = Infinity;

      for (const cam of allCameras) {
        if (typeof cam.Lat === "number" && typeof cam.Lng === "number") {
          const dLat = cam.Lat - userLocation.lat;
          const dLng = cam.Lng - userLocation.lng;
          const distSq = dLat * dLat + dLng * dLng;
          if (distSq < minDistanceSq) {
            minDistanceSq = distSq;
            closestCam = cam;
          }
        }
      }

      if (closestCam) {
        return getMoodForCamera(closestCam);
      }
    }

    // Fallback: General City Weather Forecast
    if (severeFloodCount > 0 || moderateFloodCount > 0) {
      return "flood";
    }

    // Late night sleep time (22h00 - 05h00)
    if (currentHour >= 22 || currentHour < 5) {
      return "sleep";
    }

    if (rainyCameraIds.length > 0) {
      return "rain";
    }

    return "sunny";
  }, [userLocation, allCameras, getMoodForCamera, severeFloodCount, moderateFloodCount, rainyCameraIds]);

  // 5. Mascot Image resolver
  const getMascotImage = useCallback(
    (mood?: MascotMood, type?: MascotType) => {
      const targetType = type || mascotType;
      const targetMood = mood || mascotMood;
      return MASCOT_IMAGE_MAP[targetType][targetMood] || MASCOT_IMAGE_MAP.duck.sunny;
    },
    [mascotType, mascotMood]
  );

  // 6. Dynamic Real-time Speech Quote
  const [currentQuote, setCurrentQuote] = useState<string>(() =>
    pickDynamicQuote("duck", "sunny")
  );
  const [isSpeechBubbleOpen, setIsSpeechBubbleOpen] = useState(true);

  // Refresh quote on mood/type change & auto rotate every 10 seconds
  useEffect(() => {
    setCurrentQuote(pickDynamicQuote(mascotType, mascotMood));

    const timer = setInterval(() => {
      setCurrentQuote(pickDynamicQuote(mascotType, mascotMood));
    }, 10000);

    return () => clearInterval(timer);
  }, [mascotType, mascotMood]);

  const cycleNextQuote = useCallback(() => {
    setCurrentQuote(pickDynamicQuote(mascotType, mascotMood));
    setIsSpeechBubbleOpen(true);
  }, [mascotType, mascotMood]);

  // 7. Initial Entry Rain Animation
  const [isInitialRainActive, setIsInitialRainActive] = useState(false);
  const hasTriggeredInitialRain = useRef(false);

  useEffect(() => {
    // If weather is rainy or flooded and hasn't triggered yet
    if ((mascotMood === "rain" || mascotMood === "flood" || rainyCameraIds.length > 0) && !hasTriggeredInitialRain.current) {
      hasTriggeredInitialRain.current = true;
      setIsInitialRainActive(true);

      // Auto fade out after 7.5 seconds
      const timer = setTimeout(() => {
        setIsInitialRainActive(false);
      }, 7500);

      return () => clearTimeout(timer);
    }
  }, [mascotMood, rainyCameraIds]);

  const dismissInitialRain = useCallback(() => {
    setIsInitialRainActive(false);
  }, []);

  const setCustomSpeechQuote = useCallback((quote: string) => {
    setCurrentQuote(quote);
    setIsSpeechBubbleOpen(true);
  }, []);

  return (
    <MascotContext.Provider
      value={{
        mascotType,
        setMascotType,
        toggleMascotType,
        userLocation,
        saveUserLocation,
        mascotMood,
        currentQuote,
        cycleNextQuote,
        getMascotImage,
        getMoodForCamera,
        isInitialRainActive,
        dismissInitialRain,
        isSpeechBubbleOpen,
        setIsSpeechBubbleOpen,
        setCustomSpeechQuote,
      }}
    >
      {children}
    </MascotContext.Provider>
  );
}

export function useMascotContext() {
  const ctx = useContext(MascotContext);
  if (!ctx) {
    throw new Error("useMascotContext must be used within a MascotProvider");
  }
  return ctx;
}
