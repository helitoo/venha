"use client";

import React from "react";
import { useCameraContext } from "@/context/CameraContext";
import CameraMapView from "./CameraMapView";
import CameraModal from "./CameraModal";
import MascotWidget from "./MascotWidget";
export default function CameraViewer() {
  const { selectedCamera, setSelectedCamera } = useCameraContext();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* Fullscreen Map View */}
      <CameraMapView onSelectCamera={(cam) => setSelectedCamera(cam)} />

      {/* Floating Mascot Companion Widget (Bottom-Left) */}
      <MascotWidget />

      {/* Fullscreen Camera Live Modal */}
      <CameraModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />
    </div>
  );
}
