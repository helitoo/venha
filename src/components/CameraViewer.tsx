"use client";

import React from "react";
import { useCameraContext } from "@/context/CameraContext";
import CameraMapView from "./CameraMapView";
import CameraModal from "./CameraModal";
import MascotWidget from "./MascotWidget";
export default function CameraViewer() {
  const { selectedCamera, setSelectedCamera } = useCameraContext();

  return (
    <div className="fixed inset-0 w-full h-full h-[100dvh] overflow-hidden bg-slate-950 select-none">
      {/* Fullscreen Map View */}
      <CameraMapView onSelectCamera={(cam) => setSelectedCamera(cam)} />

      {/* Floating Mascot Companion Widget (Bottom-Left) */}
      <MascotWidget />

      {/* Floating Side Right Bar (Laptop) / Fullscreen Live Modal (Mobile) */}
      <CameraModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />
    </div>
  );
}
