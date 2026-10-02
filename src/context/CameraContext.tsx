"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CameraItem, CameraStreamState, ViewMode } from "@/types/camera";

interface CameraContextType {
  // Lists & data
  allCameras: CameraItem[];
  districts: string[];
  filteredCameras: CameraItem[];
  paginatedCameras: CameraItem[];
  totalItems: number;
  totalPages: number;

  // Filter & UI States
  currentPage: number;
  itemsPerPage: number;
  searchQuery: string;
  selectedDistrict: string;
  gridCols: 2 | 3 | 4;
  selectedCamera: CameraItem | null;
  isDarkMode: boolean;
  refreshInterval: number;
  cameraCountdown: number;
  viewMode: ViewMode;

  // State dispatchers
  setCurrentPage: (page: number) => void;
  setItemsPerPage: (limit: number) => void;
  setSearchQuery: (query: string) => void;
  setSelectedDistrict: (district: string) => void;
  setGridCols: (cols: 2 | 3 | 4) => void;
  setSelectedCamera: (cam: CameraItem | null) => void;
  setRefreshInterval: (seconds: number) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleTheme: () => void;
  refreshAll: () => void;
  refreshSingleCamera: (camId: string) => void;

  // Stream state accessor & subscription (On-demand Lazy Fetching)
  streams: Record<string, CameraStreamState>;
  getStreamState: (camId: string) => CameraStreamState;
  registerActiveCamera: (camId: string) => void;
  unregisterActiveCamera: (camId: string) => void;
  updateActiveViewportCameras: (camIds: string[]) => void;
  getActiveViewportCamIds: () => string[];
}

const defaultStreamState: CameraStreamState = {
  currentImgSrc: "",
  isInitialLoading: true,
  isFetching: false,
  hasError: false,
  timeLeft: 10,
  isCountingDown: false,
};

const CameraContext = createContext<CameraContextType | null>(null);

interface CameraProviderProps {
  initialCameras: CameraItem[];
  districts: string[];
  children: React.ReactNode;
}

export function CameraProvider({
  initialCameras,
  districts,
  children,
}: CameraProviderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  // Initial params
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const limitParam = parseInt(searchParams.get("limit") || "9", 10);
  const searchParam = searchParams.get("q") || "";
  const districtParam = searchParams.get("district") || "all";
  const viewParam = (searchParams.get("view") === "map" ? "map" : "grid") as ViewMode;
  const envInterval = parseInt(
    process.env.NEXT_PUBLIC_CAMERA_REFRESH_INTERVAL ||
      process.env.NEXT_PUBLIC_REFRESH_INTERVAL ||
      "30",
    10
  );

  // States
  const [currentPage, setCurrentPage] = useState<number>(pageParam);
  const [itemsPerPage, setItemsPerPage] = useState<number>(limitParam);
  const [searchQuery, setSearchQuery] = useState<string>(searchParam);
  const [selectedDistrict, setSelectedDistrict] = useState<string>(districtParam);
  const [viewMode, setViewModeState] = useState<ViewMode>(viewParam);
  const [refreshInterval, setRefreshIntervalState] = useState<number>(
    Number.isNaN(envInterval) ? 30 : envInterval
  );
  const [gridCols, setGridCols] = useState<2 | 3 | 4>(3);
  const [selectedCamera, setSelectedCamera] = useState<CameraItem | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Stream state dictionary managed inside Context
  const [streams, setStreams] = useState<Record<string, CameraStreamState>>({});
  const streamsRef = useRef<Record<string, CameraStreamState>>(streams);
  streamsRef.current = streams;

  // Track active opened/subscribed cameras (Lazy fetching: only opened nodes fetch images)
  const activeSubscribersRef = useRef<Map<string, number>>(new Map());
  const activeViewportCamIdsRef = useRef<Set<string>>(new Set());

  // Synchronized camera countdown timer
  const [cameraCountdown, setCameraCountdown] = useState<number>(refreshInterval);
  const refreshIntervalRef = useRef<number>(refreshInterval);
  refreshIntervalRef.current = refreshInterval;

  // Initialize theme
  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setIsDarkMode(isDark || true);
    if (!document.documentElement.classList.contains("dark")) {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
      return next;
    });
  }, []);

  // Update URL helper
  const updateUrl = useCallback(
    (page: number, limit: number, q: string, dist: string, vMode?: ViewMode) => {
      startTransition(() => {
        const currentVMode = vMode || viewMode;
        const params = new URLSearchParams();
        if (page > 1) params.set("page", page.toString());
        if (limit !== 9) params.set("limit", limit.toString());
        if (q) params.set("q", q);
        if (dist !== "all") params.set("district", dist);
        if (currentVMode === "map") params.set("view", "map");

        const qs = params.toString();
        const targetUrl = qs ? `/?${qs}` : "/";
        router.replace(targetUrl, { scroll: false });
      });
    },
    [router, viewMode]
  );

  // Core fetch single camera image logic
  const fetchCameraImage = useCallback((camId: string) => {
    const timestamp = Date.now();
    const newUrl = `/api/proxy?id=${encodeURIComponent(camId)}&t=${timestamp}`;

    setStreams((prev) => {
      const existing = prev[camId];
      return {
        ...prev,
        [camId]: {
          ...(existing || defaultStreamState),
          isInitialLoading: !existing?.currentImgSrc,
          isFetching: true,
          hasError: false,
        },
      };
    });

    const img = new window.Image();
    img.onload = () => {
      setStreams((prev) => ({
        ...prev,
        [camId]: {
          currentImgSrc: newUrl,
          isInitialLoading: false,
          isFetching: false,
          hasError: false,
          timeLeft: refreshIntervalRef.current,
          isCountingDown: true,
        },
      }));
    };

    img.onerror = () => {
      setStreams((prev) => {
        const existing = prev[camId];
        return {
          ...prev,
          [camId]: {
            ...(existing || defaultStreamState),
            isInitialLoading: false,
            isFetching: false,
            hasError: !existing?.currentImgSrc,
            timeLeft: refreshIntervalRef.current,
            isCountingDown: true,
          },
        };
      });
    };

    img.src = newUrl;
  }, []);

  // Refresh all actively opened cameras (Only cameras currently opened/viewed by the user)
  const refreshActiveCameras = useCallback(() => {
    activeSubscribersRef.current.forEach((_, camId) => {
      fetchCameraImage(camId);
    });
  }, [fetchCameraImage]);

  // Synchronized Camera Refresh Timer for active subscribers
  useEffect(() => {
    if (refreshInterval <= 0) return;

    setCameraCountdown(refreshInterval);

    const timer = setInterval(() => {
      setCameraCountdown((prev) => {
        if (prev <= 1) {
          refreshActiveCameras();
          return refreshIntervalRef.current;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [refreshActiveCameras, refreshInterval]);

  // Register single active camera observer (Triggered ONLY when user opens a camera node / card / modal)
  const registerActiveCamera = useCallback(
    (camId: string) => {
      const currentCount = activeSubscribersRef.current.get(camId) || 0;
      activeSubscribersRef.current.set(camId, currentCount + 1);

      // Fetch immediately upon opening if not already loaded or fetching
      setStreams((curr) => {
        if (!curr[camId]?.currentImgSrc && !curr[camId]?.isFetching) {
          setTimeout(() => fetchCameraImage(camId), 0);
        }
        return curr;
      });
    },
    [fetchCameraImage]
  );

  // Unregister active camera observer (Triggered when user closes preview card / modal)
  const unregisterActiveCamera = useCallback((camId: string) => {
    const currentCount = activeSubscribersRef.current.get(camId) || 0;
    if (currentCount <= 1) {
      activeSubscribersRef.current.delete(camId);
    } else {
      activeSubscribersRef.current.set(camId, currentCount - 1);
    }
  }, []);

  // Update active cameras in viewport (Purely updates viewport bounds count, DOES NOT fetch images)
  const updateActiveViewportCameras = useCallback((visibleCamIds: string[]) => {
    activeViewportCamIdsRef.current = new Set(visibleCamIds);
  }, []);

  // Manual refresh for all currently opened cameras
  const refreshAll = useCallback(() => {
    setCameraCountdown(refreshIntervalRef.current);
    refreshActiveCameras();
  }, [refreshActiveCameras]);

  // Refresh single camera
  const refreshSingleCamera = useCallback(
    (camId: string) => {
      fetchCameraImage(camId);
    },
    [fetchCameraImage]
  );

  // Set refresh interval
  const setRefreshInterval = useCallback((seconds: number) => {
    setRefreshIntervalState(seconds);
    refreshIntervalRef.current = seconds;
    setCameraCountdown(seconds);
  }, []);

  // Filtered cameras
  const filteredCameras = useMemo(() => {
    return initialCameras.filter((cam) => {
      const matchDistrict =
        selectedDistrict === "all" ||
        (cam.District || cam.Disctrict || "").toLowerCase() ===
          selectedDistrict.toLowerCase();

      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        cam.CamName.toLowerCase().includes(q) ||
        (cam.District && cam.District.toLowerCase().includes(q)) ||
        cam.CamId.toLowerCase().includes(q);

      return matchDistrict && matchQuery;
    });
  }, [initialCameras, selectedDistrict, searchQuery]);

  // Pagination
  const totalItems = filteredCameras.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const validCurrentPage = Math.min(currentPage, totalPages);

  const paginatedCameras = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * itemsPerPage;
    return filteredCameras.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredCameras, validCurrentPage, itemsPerPage]);

  // Actions
  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      updateUrl(newPage, itemsPerPage, searchQuery, selectedDistrict);
    },
    [itemsPerPage, searchQuery, selectedDistrict, updateUrl]
  );

  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchQuery(val);
      setCurrentPage(1);
      updateUrl(1, itemsPerPage, val, selectedDistrict);
    },
    [itemsPerPage, selectedDistrict, updateUrl]
  );

  const handleDistrictChange = useCallback(
    (dist: string) => {
      setSelectedDistrict(dist);
      setCurrentPage(1);
      updateUrl(1, itemsPerPage, searchQuery, dist);
    },
    [itemsPerPage, searchQuery, updateUrl]
  );

  const handleLimitChange = useCallback(
    (limit: number) => {
      setItemsPerPage(limit);
      setCurrentPage(1);
      updateUrl(1, limit, searchQuery, selectedDistrict);
    },
    [searchQuery, selectedDistrict, updateUrl]
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewModeState(mode);
      updateUrl(currentPage, itemsPerPage, searchQuery, selectedDistrict, mode);
    },
    [currentPage, itemsPerPage, searchQuery, selectedDistrict, updateUrl]
  );

  const getStreamState = useCallback(
    (camId: string): CameraStreamState => {
      return (
        streamsRef.current[camId] || {
          ...defaultStreamState,
          timeLeft: refreshIntervalRef.current,
        }
      );
    },
    []
  );

  const getActiveViewportCamIds = useCallback(() => {
    return Array.from(activeViewportCamIdsRef.current);
  }, []);

  const contextValue: CameraContextType = {
    allCameras: initialCameras,
    districts,
    filteredCameras,
    paginatedCameras,
    totalItems,
    totalPages,
    currentPage: validCurrentPage,
    itemsPerPage,
    searchQuery,
    selectedDistrict,
    gridCols,
    selectedCamera,
    isDarkMode,
    refreshInterval,
    cameraCountdown,
    viewMode,

    setCurrentPage: handlePageChange,
    setItemsPerPage: handleLimitChange,
    setSearchQuery: handleSearchChange,
    setSelectedDistrict: handleDistrictChange,
    setGridCols,
    setSelectedCamera,
    setRefreshInterval,
    setViewMode: handleViewModeChange,
    toggleTheme,
    refreshAll,
    refreshSingleCamera,

    streams,
    getStreamState,
    registerActiveCamera,
    unregisterActiveCamera,
    updateActiveViewportCameras,
    getActiveViewportCamIds,
  };

  return (
    <CameraContext.Provider value={contextValue}>
      {children}
    </CameraContext.Provider>
  );
}

export function useCameraContext(): CameraContextType {
  const ctx = useContext(CameraContext);
  if (!ctx) {
    throw new Error("useCameraContext must be used within a CameraProvider");
  }
  return ctx;
}

/**
 * Custom hook for components displaying a camera stream.
 * Automatically subscribes the camera to Context's fetching & countdown lifecycle.
 * Component contains NO fetch or timer logic.
 */
export function useCameraStream(camId: string) {
  const {
    getStreamState,
    registerActiveCamera,
    unregisterActiveCamera,
    refreshSingleCamera,
    refreshInterval,
  } = useCameraContext();

  useEffect(() => {
    registerActiveCamera(camId);
    return () => {
      unregisterActiveCamera(camId);
    };
  }, [camId, registerActiveCamera, unregisterActiveCamera]);

  return {
    stream: getStreamState(camId),
    refreshInterval,
    refresh: () => refreshSingleCamera(camId),
  };
}
