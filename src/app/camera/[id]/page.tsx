import React, { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCameraById, getAllCameras, getDistricts } from "@/lib/cameras";
import { CameraProvider } from "@/context/CameraContext";
import CameraDetailClient from "./CameraDetailClient";

import type { Metadata } from "next";

interface CameraPageProps {
  params: Promise<{
    id: string;
  }>;
}

export async function generateMetadata({ params }: CameraPageProps): Promise<Metadata> {
  const { id } = await params;
  const camera = getCameraById(id);
  if (!camera) return { title: "Về Nhà" };

  return {
    title: `${camera.CamName} | Về Nhà`,
    description: `Xem camera trực tiếp ${camera.CamName} (${camera.District || "TP.HCM"}) trên hệ thống Về Nhà.`,
  };
}

export async function generateStaticParams() {
  const cameras = getAllCameras();
  return cameras.slice(0, 20).map((cam) => ({
    id: cam.CamId,
  }));
}

export default async function CameraDetailPage({ params }: CameraPageProps) {
  const { id } = await params;
  const camera = getCameraById(id);

  if (!camera) {
    notFound();
  }

  const allCameras = getAllCameras();
  const districts = getDistricts();

  const relatedCameras = allCameras
    .filter(
      (c) =>
        c.CamId !== camera.CamId &&
        (c.District || c.Disctrict) === (camera.District || camera.Disctrict)
    )
    .slice(0, 3);

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 dark:bg-slate-950" />}>
      <CameraProvider initialCameras={allCameras} districts={districts}>
        <CameraDetailClient camera={camera} relatedCameras={relatedCameras} />
      </CameraProvider>
    </Suspense>
  );
}
