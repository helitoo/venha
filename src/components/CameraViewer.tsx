"use client";

import React from "react";
import { useCameraContext } from "@/context/CameraContext";
import CameraMapView from "./CameraMapView";
import CameraModal from "./CameraModal";

export default function CameraViewer() {
  const { selectedCamera, setSelectedCamera } = useCameraContext();

  return (
    <div className="w-screen h-screen overflow-hidden bg-slate-950">
      {/* Fullscreen Map View */}
      <CameraMapView onSelectCamera={(cam) => setSelectedCamera(cam)} />

      {/* Fullscreen Camera Live Modal */}
      <CameraModal
        camera={selectedCamera}
        onClose={() => setSelectedCamera(null)}
      />
    </div>
  );
}
